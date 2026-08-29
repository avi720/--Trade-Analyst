/**
 * Route-level tests for the admin tier toggle.
 *
 * This is the only path in the app that grants Pro without a payment, and it
 * ran for months writing no trace at all — the reason an admin-granted Pro is
 * indistinguishable from a paid one in the audit trail. These tests pin the
 * three properties that matter:
 *   - every flip emits a tier_upgraded / tier_downgraded AuditEvent carrying
 *     `source: 'admin_toggle'` and the acting admin's id
 *   - the LS columns stay untouched (billing/pause + billing/resume feed
 *     lemonsqueezySubscriptionId straight to the LS API)
 *   - BillingWebhookEvent is never written — it is the LS delivery-dedup
 *     ledger, and there is no delivery here to dedup
 *
 * Supabase client, admin gate and audit logger are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

// Not importOriginal(): the real module pulls in lib/supabase/auth.ts, which
// imports 'server-only' — unresolvable under vitest. AdminAuthError and
// adminAuthErrorResponse are reproduced here so the 401/403 branch still runs.
vi.mock('@/lib/auth/require-admin', async () => {
  const { NextResponse } = await import('next/server')
  class AdminAuthError extends Error {
    status: 401 | 403
    constructor(status: 401 | 403, message: string) {
      super(message)
      this.status = status
      this.name = 'AdminAuthError'
    }
  }
  return {
    AdminAuthError,
    requireAdmin: vi.fn(),
    adminAuthErrorResponse: (err: unknown) =>
      err instanceof AdminAuthError
        ? NextResponse.json({ error: err.message }, { status: err.status })
        : null,
  }
})

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, AdminAuthError } from '@/lib/auth/require-admin'
import { logAuditEvent } from '@/lib/audit/log'
import { POST } from '@/app/api/admin/users/[userId]/toggle-tier/route'

const ACTOR_ID = 'a0000000-0000-0000-0000-0000000000aa'
const TARGET_ID = 'b0000000-0000-0000-0000-0000000000bb'

function makeReq(): NextRequest {
  return new Request('http://localhost/api/admin/users/x/toggle-tier', {
    method: 'POST',
  }) as unknown as NextRequest
}

function ctx(userId: string = TARGET_ID) {
  return { params: Promise.resolve({ userId }) }
}

interface AdminMockOpts {
  currentTier?: string | null
  updateError?: { message: string } | null
}

function mockAdmin(opts: AdminMockOpts = {}) {
  const { currentTier = 'Free', updateError = null } = opts
  const updatePayloads: Record<string, unknown>[] = []

  const chain = (table: string) => {
    if (table !== 'User') {
      throw new Error(`unexpected table access in test: ${table}`)
    }
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: currentTier === null ? null : { subscriptionTier: currentTier },
        error: null,
      })),
    }
    return {
      select: vi.fn(() => selectChain),
      update: vi.fn((payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return { eq: vi.fn(async () => ({ error: updateError })) }
      }),
    }
  }

  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn(chain),
  } as unknown as ReturnType<typeof createAdminClient>)

  return { updatePayloads }
}

function grantAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: ACTOR_ID },
    supabase: {},
  } as unknown as Awaited<ReturnType<typeof requireAdmin>>)
}

describe('/api/admin/users/[userId]/toggle-tier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    grantAdmin()
  })

  describe('audit trail', () => {
    it('Free → Pro emits tier_upgraded tagged with source + acting admin', async () => {
      mockAdmin({ currentTier: 'Free' })
      const res = await POST(makeReq(), ctx())

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ tier: 'Pro', status: 'active' })
      expect(logAuditEvent).toHaveBeenCalledTimes(1)
      expect(vi.mocked(logAuditEvent).mock.calls[0][0]).toMatchObject({
        userId: TARGET_ID,
        eventType: 'tier_upgraded',
        status: 'success',
        metadata: {
          source: 'admin_toggle',
          actorId: ACTOR_ID,
          priorTier: 'Free',
          nextTier: 'Pro',
        },
      })
    })

    it('Pro → Free emits tier_downgraded', async () => {
      mockAdmin({ currentTier: 'Pro' })
      const res = await POST(makeReq(), ctx())

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        tier: 'Free',
        status: 'cancelled',
        renewsAt: null,
      })
      expect(vi.mocked(logAuditEvent).mock.calls[0][0]).toMatchObject({
        eventType: 'tier_downgraded',
        metadata: { source: 'admin_toggle', priorTier: 'Pro', nextTier: 'Free' },
      })
    })

    it('passes the request through so the audit row gets IP / UA / country', async () => {
      mockAdmin()
      await POST(makeReq(), ctx())
      expect(vi.mocked(logAuditEvent).mock.calls[0][0].request).toBeDefined()
    })
  })

  describe('what it must NOT write', () => {
    it('never touches the lemonsqueezy columns', async () => {
      const { updatePayloads } = mockAdmin()
      await POST(makeReq(), ctx())

      expect(updatePayloads).toHaveLength(1)
      expect(Object.keys(updatePayloads[0]).sort()).toEqual([
        'subscriptionRenewsAt',
        'subscriptionStatus',
        'subscriptionTier',
      ])
    })

    // The mocked client throws on any table other than User, so a stray
    // BillingWebhookEvent insert would surface as a 500 here.
    it('never writes a BillingWebhookEvent row', async () => {
      mockAdmin()
      const res = await POST(makeReq(), ctx())
      expect(res.status).toBe(200)
    })
  })

  describe('failure paths write no audit event', () => {
    it('non-admin caller → 403, no audit', async () => {
      vi.mocked(requireAdmin).mockRejectedValue(
        new AdminAuthError(403, 'Forbidden'),
      )
      const res = await POST(makeReq(), ctx())
      expect(res.status).toBe(403)
      expect(logAuditEvent).not.toHaveBeenCalled()
    })

    it('malformed userId → 400, no audit', async () => {
      mockAdmin()
      const res = await POST(makeReq(), ctx('not-a-uuid'))
      expect(res.status).toBe(400)
      expect(logAuditEvent).not.toHaveBeenCalled()
    })

    it('unknown user → 404, no audit', async () => {
      mockAdmin({ currentTier: null })
      const res = await POST(makeReq(), ctx())
      expect(res.status).toBe(404)
      expect(logAuditEvent).not.toHaveBeenCalled()
    })

    it('failed DB update → 500, no audit', async () => {
      mockAdmin({ updateError: { message: 'boom' } })
      const res = await POST(makeReq(), ctx())
      expect(res.status).toBe(500)
      expect(logAuditEvent).not.toHaveBeenCalled()
    })
  })
})
