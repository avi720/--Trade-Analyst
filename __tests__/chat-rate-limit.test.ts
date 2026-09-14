/**
 * Route-level tests for the chat message caps on POST /api/chat.
 *
 * Three buckets: hourly (both tiers), daily-free, daily-pro. The daily
 * buckets are keyed separately so a tier upgrade never inherits the
 * exhausted Free window. These tests stub auth + tier + the rate-limit
 * primitive and only exercise the route's control-flow up to the body
 * parse — a request with an unparseable body reaches the 400 right after
 * the limiter, which is how the "within limit" cases stop before Gemini.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/auth/rate-limit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth/rate-limit')>()
  return {
    ...original,
    checkRateLimit: vi.fn(),
  }
})

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}))

vi.mock('@/lib/billing/tier', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/billing/tier')>()
  return {
    ...original,
    getUserTier: vi.fn(),
  }
})

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { logAuditEvent } from '@/lib/audit/log'
import {
  getUserTier,
  CHAT_HOURLY_LIMIT,
  CHAT_DAILY_LIMIT_FREE,
  CHAT_DAILY_LIMIT_PRO,
} from '@/lib/billing/tier'
import { POST } from '@/app/api/chat/route'

const TEST_USER_ID = 'u-chat-001'

function makeReq(body: string): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', 'user-agent': 'vitest' },
  })
}

// Deliberately not JSON so an allowed request 400s right after the limiter.
const NOT_JSON = '{'

function setAuthOk() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: { id: TEST_USER_ID, email: 'user@example.test' } },
        error: null,
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function setTier(tier: 'Free' | 'Pro') {
  vi.mocked(getUserTier).mockResolvedValue({ tier, status: 'active', renewsAt: null })
}

function rlAllow() {
  return { ok: true, remaining: 9, resetAt: new Date(Date.now() + 3600_000) }
}
function rlDeny() {
  return { ok: false, remaining: 0, resetAt: new Date(Date.now() + 5 * 3600_000) }
}

function consultedKeys(): string[] {
  return vi.mocked(checkRateLimit).mock.calls.map((c) => c[0])
}

describe('/api/chat message caps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuthOk()
  })

  it('Free within limit — consults hourly + daily-free with the tier constants, then proceeds', async () => {
    setTier('Free')
    vi.mocked(checkRateLimit).mockResolvedValue(rlAllow())

    const res = await POST(makeReq(NOT_JSON))
    expect(res.status).toBe(400) // body parse — i.e. the limiter let it through

    expect(consultedKeys()).toEqual([
      `user:${TEST_USER_ID}:chat`,
      `user:${TEST_USER_ID}:chat:daily-free`,
    ])
    expect(vi.mocked(checkRateLimit).mock.calls[0].slice(1)).toEqual([CHAT_HOURLY_LIMIT, 3600])
    expect(vi.mocked(checkRateLimit).mock.calls[1].slice(1)).toEqual([CHAT_DAILY_LIMIT_FREE, 86400])
    expect(vi.mocked(logAuditEvent)).not.toHaveBeenCalled()
  })

  it('Pro within limit — consults hourly + daily-pro, never the Free bucket', async () => {
    setTier('Pro')
    vi.mocked(checkRateLimit).mockResolvedValue(rlAllow())

    const res = await POST(makeReq(NOT_JSON))
    expect(res.status).toBe(400)

    expect(consultedKeys()).toEqual([
      `user:${TEST_USER_ID}:chat`,
      `user:${TEST_USER_ID}:chat:daily-pro`,
    ])
    expect(vi.mocked(checkRateLimit).mock.calls[1].slice(1)).toEqual([CHAT_DAILY_LIMIT_PRO, 86400])
  })

  it('hourly bucket exhausted — 429 for either tier, audit bucket=hourly', async () => {
    setTier('Pro')
    vi.mocked(checkRateLimit).mockResolvedValueOnce(rlDeny())

    const res = await POST(makeReq(NOT_JSON))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    const body = await res.json()
    expect(body.error).toMatch(/לשעה/)
    expect(body.retryAfterSeconds).toBeGreaterThan(0)

    expect(consultedKeys()).toHaveLength(1)
    const auditArg = vi.mocked(logAuditEvent).mock.calls[0][0]
    expect(auditArg.userId).toBe(TEST_USER_ID)
    expect(auditArg.eventType).toBe('rate_limit_hit')
    expect(auditArg.metadata).toMatchObject({ action: 'chat', bucket: 'hourly' })
  })

  it('Free daily bucket exhausted — 429 with upgrade nudge quoting the Pro cap, audit bucket=daily_free', async () => {
    setTier('Free')
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce(rlAllow()) // hourly
      .mockResolvedValueOnce(rlDeny())  // daily-free

    const res = await POST(makeReq(NOT_JSON))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toContain(String(CHAT_DAILY_LIMIT_FREE))
    expect(body.error).toContain(String(CHAT_DAILY_LIMIT_PRO))
    expect(body.error).not.toMatch(/ללא הגבלה/)

    const auditArg = vi.mocked(logAuditEvent).mock.calls[0][0]
    expect(auditArg.metadata).toMatchObject({ action: 'chat', bucket: 'daily_free' })
  })

  it('Pro daily bucket exhausted — 429 quoting the cap and hours-to-reset, audit bucket=daily_pro', async () => {
    setTier('Pro')
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce(rlAllow()) // hourly
      .mockResolvedValueOnce(rlDeny())  // daily-pro (resets in ~5h)

    const res = await POST(makeReq(NOT_JSON))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toContain(String(CHAT_DAILY_LIMIT_PRO))
    expect(body.error).toMatch(/כ-5 שעות/)
    expect(body.retryAfterSeconds).toBeGreaterThan(4 * 3600)

    const auditArg = vi.mocked(logAuditEvent).mock.calls[0][0]
    expect(auditArg.metadata).toMatchObject({ action: 'chat', bucket: 'daily_pro' })
  })

  it('unauthenticated — 401 before any limiter call', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res = await POST(makeReq(NOT_JSON))
    expect(res.status).toBe(401)
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled()
    expect(vi.mocked(getUserTier)).not.toHaveBeenCalled()
  })
})
