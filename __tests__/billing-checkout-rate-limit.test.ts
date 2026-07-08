/**
 * Route-level tests for X3 — rate limit on POST /api/billing/checkout.
 *
 * Every checkout call fires a signed request to Lemon Squeezy's API with the
 * owner's store-wide API key. Without a per-user cap, one abusive account
 * could DoS the store's 120 req/min limit for the whole business. The route
 * now uses two buckets — 10/hour (burst) and 30/day (sustained).
 *
 * These tests stub Supabase auth + the rate-limit primitive so we exercise
 * only the route's control-flow: when either bucket returns ok:false, the
 * route short-circuits to 429 with a Retry-After header, writes an
 * `AuditEvent` with metadata.action='billing_checkout', and never reaches
 * the Lemon Squeezy fetch.
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

vi.mock('@/lib/billing/lemon-squeezy', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/billing/lemon-squeezy')>()
  return {
    ...original,
    getLemonSqueezyConfig: vi.fn(() => ({
      apiKey: 'test-key',
      storeId: 'store-1',
      variantIdMonthly: 'v-monthly',
      variantIdAnnual: 'v-annual',
      discountCodeLaunchMonthly: undefined,
      discountCodeLaunchAnnual: undefined,
    })),
    createCheckoutSession: vi.fn(async () => ({ url: 'https://checkout.example/xyz' })),
    isLaunchPromoActive: vi.fn(() => false),
  }
})

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { logAuditEvent } from '@/lib/audit/log'
import { createCheckoutSession } from '@/lib/billing/lemon-squeezy'
import { POST } from '@/app/api/billing/checkout/route'

const TEST_USER_ID = 'u-billing-001'

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'user-agent': 'vitest' },
  })
}

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

function rlAllow() {
  return { ok: true, remaining: 9, resetAt: new Date(Date.now() + 3600_000) }
}
function rlDeny() {
  return { ok: false, remaining: 0, resetAt: new Date(Date.now() + 3600_000) }
}

describe('X3 — /api/billing/checkout rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuthOk()
  })

  it('within limit — returns 200 with checkout URL, calls LS once', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce(rlAllow()) // hourly
      .mockResolvedValueOnce(rlAllow()) // daily

    const res = await POST(makeReq({ plan: 'monthly' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://checkout.example/xyz')
    expect(vi.mocked(createCheckoutSession)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(logAuditEvent)).not.toHaveBeenCalled()
  })

  it('11th hourly call — returns 429 with Retry-After, writes audit event, never calls LS', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce(rlDeny()) // hourly bucket exhausted

    const res = await POST(makeReq({ plan: 'monthly' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()

    const body = await res.json()
    expect(body.error).toMatch(/יותר מדי/)
    expect(body.retryAfterSeconds).toBeGreaterThan(0)

    expect(vi.mocked(createCheckoutSession)).not.toHaveBeenCalled()

    expect(vi.mocked(logAuditEvent)).toHaveBeenCalledTimes(1)
    const auditArg = vi.mocked(logAuditEvent).mock.calls[0][0]
    expect(auditArg.userId).toBe(TEST_USER_ID)
    expect(auditArg.eventType).toBe('rate_limit_hit')
    expect(auditArg.status).toBe('failure')
    expect(auditArg.metadata).toMatchObject({ action: 'billing_checkout', bucket: 'hourly' })
  })

  it('31st daily call — hourly passes but daily bucket denies, returns 429 with daily bucket audit', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce(rlAllow())  // hourly ok
      .mockResolvedValueOnce(rlDeny())   // daily exhausted

    const res = await POST(makeReq({ plan: 'annual' }))
    expect(res.status).toBe(429)
    expect(vi.mocked(createCheckoutSession)).not.toHaveBeenCalled()

    const auditArg = vi.mocked(logAuditEvent).mock.calls[0][0]
    expect(auditArg.metadata).toMatchObject({ action: 'billing_checkout', bucket: 'daily' })
  })

  it('unauthenticated call — 401 before any rate-limit call', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res = await POST(makeReq({ plan: 'monthly' }))
    expect(res.status).toBe(401)
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled()
  })

  it('X8 — authenticated user with missing email → 400 before rate limit + LS call', async () => {
    // Simulate an edge case: magic-link / OAuth session where the user record
    // exists but has no email attached. The route must short-circuit with a
    // debuggable Hebrew instruction so the user knows to complete their profile
    // instead of seeing a generic checkout failure.
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: TEST_USER_ID, email: null } },
          error: null,
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res = await POST(makeReq({ plan: 'monthly' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/כתובת מייל/)
    expect(body.error).toMatch(/פרופיל/)
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled()
    expect(vi.mocked(createCheckoutSession)).not.toHaveBeenCalled()
  })

  it('X8 — authenticated user with empty-string email → 400 (falsy guard covers both null and "")', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: TEST_USER_ID, email: '' } },
          error: null,
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res = await POST(makeReq({ plan: 'monthly' }))
    expect(res.status).toBe(400)
    expect(vi.mocked(createCheckoutSession)).not.toHaveBeenCalled()
  })
})
