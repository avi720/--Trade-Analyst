/**
 * Route-level tests for the Lemon Squeezy webhook.
 *
 * Covers Phase 2 hardening:
 *   - X11 — HMAC signature shape check + three distinct log paths
 *   - X9  — non-UUID user_id short-circuits to 200 + ignored
 *   - X5  — sha256(body) idempotency: duplicate delivery returns 200 without
 *           re-writing user state (BillingWebhookEvent unique index)
 *   - X14 — orphan user_id (valid UUID but no matching User row) returns 200
 *           and emits a `subscription_orphaned` AuditEvent
 *
 * Supabase clients + LS config are mocked. HMAC signatures are computed with
 * a fixed test secret so we can build both valid and malformed test cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/billing/lemon-squeezy', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/billing/lemon-squeezy')>()
  return {
    ...original,
    getLemonSqueezyConfig: vi.fn(),
  }
})

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getLemonSqueezyConfig } from '@/lib/billing/lemon-squeezy'
import { logAuditEvent } from '@/lib/audit/log'
import { POST } from '@/app/api/billing/webhook/route'

const TEST_SECRET = 'test-webhook-secret'
const REAL_USER_ID = 'a0000000-0000-0000-0000-000000000010'

function makeConfig() {
  return {
    apiKey: 'test-key',
    storeId: '1',
    variantIdMonthly: 'v1',
    variantIdAnnual: 'v2',
    webhookSecret: TEST_SECRET,
    discountCodeLaunchMonthly: null,
    discountCodeLaunchAnnual: null,
  }
}

function sign(body: string, secret: string = TEST_SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

function makeBody(overrides?: {
  eventName?: string
  userId?: string
  status?: string
  subscriptionId?: string
}) {
  return JSON.stringify({
    meta: {
      event_name: overrides?.eventName ?? 'subscription_created',
      custom_data: { user_id: overrides?.userId ?? REAL_USER_ID },
    },
    data: {
      id: overrides?.subscriptionId ?? 'sub_1',
      attributes: {
        status: overrides?.status ?? 'active',
        customer_id: 12345,
        renews_at: '2027-01-01T00:00:00Z',
        ends_at: null,
      },
    },
  })
}

function makeReq(body: string, signature: string | null): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (signature !== null) headers['X-Signature'] = signature
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    body,
    headers,
  })
}

// Mock admin client with configurable behavior for the three DB call sites.
interface AdminMockOpts {
  webhookInsertResult?: { error: { code?: string; message?: string } | null }
  userSelectResult?: { data: { subscriptionTier: string } | null }
  userUpdateResult?: { data: { id: string }[] | null; error: { message: string } | null }
}

function mockAdmin(opts: AdminMockOpts = {}) {
  const {
    webhookInsertResult = { error: null },
    userSelectResult = { data: { subscriptionTier: 'Free' } },
    userUpdateResult = { data: [{ id: REAL_USER_ID }], error: null },
  } = opts

  // Postgrest chain: .from(table).insert(row) / .update(row).eq(k,v).select(cols) /
  // .select(cols).eq(k,v).maybeSingle()
  const chain = (table: string) => {
    if (table === 'BillingWebhookEvent') {
      return {
        insert: vi.fn(async () => webhookInsertResult),
      }
    }
    if (table === 'User') {
      // For both select-then-update patterns we need to support both chains.
      const updateChain = {
        eq: vi.fn().mockReturnThis(),
        select: vi.fn(async () => userUpdateResult),
      }
      const selectChain = {
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => userSelectResult),
      }
      return {
        select: vi.fn(() => selectChain),
        update: vi.fn(() => updateChain),
      }
    }
    throw new Error(`unexpected table access in test: ${table}`)
  }

  const client = { from: vi.fn(chain) }
  vi.mocked(createAdminClient).mockReturnValue(
    client as unknown as ReturnType<typeof createAdminClient>,
  )
  return client
}

describe('/api/billing/webhook — hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getLemonSqueezyConfig).mockReturnValue(makeConfig())
  })

  describe('X11 — HMAC signature verification', () => {
    it('missing X-Signature header → 401 with `missing signature` body', async () => {
      mockAdmin()
      const body = makeBody()
      const res = await POST(makeReq(body, null))
      expect(res.status).toBe(401)
      const j = await res.json()
      expect(j.error).toBe('missing signature')
    })

    it('malformed X-Signature (odd length hex) → 401 without ever reaching timingSafeEqual', async () => {
      mockAdmin()
      const body = makeBody()
      const res = await POST(makeReq(body, 'abc'))
      expect(res.status).toBe(401)
    })

    it('malformed X-Signature (non-hex chars) → 401', async () => {
      mockAdmin()
      const body = makeBody()
      // 64 chars but includes 'z' — not hex.
      const res = await POST(makeReq(body, 'z'.repeat(64)))
      expect(res.status).toBe(401)
    })

    it('valid-shape but wrong-key signature → 401 with `invalid signature`', async () => {
      mockAdmin()
      const body = makeBody()
      const res = await POST(makeReq(body, sign(body, 'wrong-secret')))
      expect(res.status).toBe(401)
      const j = await res.json()
      expect(j.error).toBe('invalid signature')
    })

    it('correct HMAC + valid payload → 200', async () => {
      mockAdmin()
      const body = makeBody()
      const res = await POST(makeReq(body, sign(body)))
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.ok).toBe(true)
    })
  })

  describe('X9 — user_id shape validation', () => {
    it('non-UUID user_id → 200 with `ignored: invalid user_id` (LS stops retrying)', async () => {
      const admin = mockAdmin()
      const body = makeBody({ userId: 'not-a-uuid-at-all' })
      const res = await POST(makeReq(body, sign(body)))
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.ignored).toBe('invalid user_id')
      // No DB writes — the guard fires before any admin call.
      expect(admin.from).not.toHaveBeenCalledWith('BillingWebhookEvent')
      expect(admin.from).not.toHaveBeenCalledWith('User')
    })

    it('missing user_id entirely → 400', async () => {
      mockAdmin()
      const body = JSON.stringify({
        meta: { event_name: 'subscription_created' },
        data: {
          id: 'sub_1',
          attributes: { status: 'active', customer_id: 1, renews_at: null, ends_at: null },
        },
      })
      const res = await POST(makeReq(body, sign(body)))
      expect(res.status).toBe(400)
    })
  })

  describe('X5 — idempotency via sha256(body) UNIQUE index', () => {
    it('duplicate delivery (23505 on BillingWebhookEvent) → 200 duplicate:true, no User update', async () => {
      const admin = mockAdmin({
        webhookInsertResult: {
          error: { code: '23505', message: 'unique violation on event_id' },
        },
      })
      const body = makeBody()
      const res = await POST(makeReq(body, sign(body)))
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.duplicate).toBe(true)
      // We never touched User because the ledger insert already claimed the event.
      expect(admin.from).toHaveBeenCalledWith('BillingWebhookEvent')
      expect(admin.from).not.toHaveBeenCalledWith('User')
    })

    it('non-23505 DB error on ledger insert → 500 (so LS retries later)', async () => {
      mockAdmin({
        webhookInsertResult: {
          error: { code: '08006', message: 'connection failure' },
        },
      })
      const body = makeBody()
      const res = await POST(makeReq(body, sign(body)))
      expect(res.status).toBe(500)
    })
  })

  describe('X14 — orphaned user_id (valid UUID, no User row) → 200 + audit', () => {
    it('User update returns zero rows → 200 ignored:user_not_found + subscription_orphaned audit', async () => {
      mockAdmin({
        userUpdateResult: { data: [], error: null },
      })
      const body = makeBody()
      const res = await POST(makeReq(body, sign(body)))
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.ignored).toBe('user_not_found')

      const audits = vi.mocked(logAuditEvent).mock.calls
      const orphanAudit = audits.find((c) => c[0].eventType === 'subscription_orphaned')
      expect(orphanAudit).toBeDefined()
      expect(orphanAudit![0].status).toBe('failure')
      expect(orphanAudit![0].userId).toBe(REAL_USER_ID)
    })
  })
})
