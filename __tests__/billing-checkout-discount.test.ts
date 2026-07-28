/**
 * Discount-code wiring tests for POST /api/billing/checkout.
 *
 * The displayed launch price is copy; the charged amount is (LS variant base
 * price − discount code). The one thing the APP code controls is WHICH discount
 * code string it forwards to Lemon Squeezy. If that wiring breaks — wrong code,
 * or none while the promo is active — the user silently pays full price while
 * the UI still advertises the promo. These tests lock the wiring:
 *   - promo active  → correct per-plan code forwarded
 *   - promo expired → no code forwarded (full price, by design)
 *   - promo active but env code unset → no code forwarded (documents the trap)
 *
 * (The actual $ amount lives in the LS dashboard and is out of scope for a unit
 * test — but the code→LS handoff that has to be right for the promo to apply is
 * now covered.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

vi.mock('@/lib/auth/rate-limit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth/rate-limit')>()
  return { ...original, checkRateLimit: vi.fn() }
})

vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }))

vi.mock('@/lib/billing/lemon-squeezy', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/billing/lemon-squeezy')>()
  return {
    ...original,
    getLemonSqueezyConfig: vi.fn(),
    createCheckoutSession: vi.fn(async () => ({ url: 'https://checkout.example/xyz' })),
    isLaunchPromoActive: vi.fn(() => true),
  }
})

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import {
  createCheckoutSession,
  getLemonSqueezyConfig,
  isLaunchPromoActive,
  type LemonSqueezyConfig,
} from '@/lib/billing/lemon-squeezy'
import { POST } from '@/app/api/billing/checkout/route'

const TEST_USER_ID = 'u-billing-disc'

const CONFIG_WITH_CODES: LemonSqueezyConfig = {
  apiKey: 'test-key',
  storeId: 'store-1',
  variantIdMonthly: 'v-monthly',
  variantIdAnnual: 'v-annual',
  webhookSecret: 'whsec',
  discountCodeLaunchMonthly: 'LAUNCH-MONTHLY',
  discountCodeLaunchAnnual: 'LAUNCH-ANNUAL',
}

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

function discountArgOfFirstCall(): string | undefined {
  const call = vi.mocked(createCheckoutSession).mock.calls[0]
  return call[1].discountCode
}

describe('/api/billing/checkout — launch discount wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuthOk()
    vi.mocked(checkRateLimit).mockResolvedValue({
      ok: true,
      remaining: 9,
      resetAt: new Date(Date.now() + 3600_000),
    })
    vi.mocked(isLaunchPromoActive).mockReturnValue(true)
    vi.mocked(getLemonSqueezyConfig).mockReturnValue(CONFIG_WITH_CODES)
  })

  it('promo active + monthly → forwards the monthly launch code', async () => {
    const res = await POST(makeReq({ plan: 'monthly' }))
    expect(res.status).toBe(200)
    expect(vi.mocked(createCheckoutSession)).toHaveBeenCalledTimes(1)
    expect(discountArgOfFirstCall()).toBe('LAUNCH-MONTHLY')
  })

  it('promo active + annual → forwards the annual launch code', async () => {
    const res = await POST(makeReq({ plan: 'annual' }))
    expect(res.status).toBe(200)
    expect(discountArgOfFirstCall()).toBe('LAUNCH-ANNUAL')
  })

  it('promo expired → forwards no discount code (full price by design)', async () => {
    vi.mocked(isLaunchPromoActive).mockReturnValue(false)
    const res = await POST(makeReq({ plan: 'monthly' }))
    expect(res.status).toBe(200)
    expect(vi.mocked(createCheckoutSession)).toHaveBeenCalledTimes(1)
    expect(discountArgOfFirstCall()).toBeUndefined()
  })

  it('promo active but env code unset → forwards no code (silent-full-price trap is documented, not hidden)', async () => {
    vi.mocked(getLemonSqueezyConfig).mockReturnValue({
      ...CONFIG_WITH_CODES,
      discountCodeLaunchMonthly: null,
      discountCodeLaunchAnnual: null,
    })
    const res = await POST(makeReq({ plan: 'monthly' }))
    expect(res.status).toBe(200)
    expect(discountArgOfFirstCall()).toBeUndefined()
  })
})
