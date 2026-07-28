/**
 * Payload tests for createCheckoutSession — asserts the exact Lemon Squeezy
 * checkout request body the app sends:
 *   - the correct variant per plan (in both product_options and relationships)
 *   - a discount code (when provided) attached as checkout_data.discount_code
 *     — Lemon Squeezy's documented shape, NOT relationships.discount
 *   - no discount_code key at all when none is provided
 *
 * This is the wire-format half of the launch-promo guarantee: if the code stops
 * putting discount_code where LS reads it, the promo silently stops applying.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCheckoutSession, type LemonSqueezyConfig } from '@/lib/billing/lemon-squeezy'

const config: LemonSqueezyConfig = {
  apiKey: 'test-key',
  storeId: 'store-1',
  variantIdMonthly: '111',
  variantIdAnnual: '222',
  webhookSecret: 'whsec',
  discountCodeLaunchMonthly: null,
  discountCodeLaunchAnnual: null,
}

const baseOptions = {
  userId: 'u1',
  userEmail: 'a@b.c',
  successUrl: 'https://site/ok',
} as const

function mockFetchOk() {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: { attributes: { url: 'https://cx/abc' } } }), {
        status: 200,
      }),
  )
}

function requestBody(fetchMock: ReturnType<typeof mockFetchOk>) {
  const init = fetchMock.mock.calls[0][1] as RequestInit
  return JSON.parse(init.body as string)
}

describe('createCheckoutSession — LS checkout payload', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('monthly plan → monthly variant in both product_options and relationships', async () => {
    const f = mockFetchOk()
    vi.stubGlobal('fetch', f)
    await createCheckoutSession(config, { ...baseOptions, plan: 'monthly' })
    const body = requestBody(f)
    expect(body.data.attributes.product_options.enabled_variants).toEqual([111])
    expect(body.data.relationships.variant.data.id).toBe('111')
  })

  it('annual plan → annual variant', async () => {
    const f = mockFetchOk()
    vi.stubGlobal('fetch', f)
    await createCheckoutSession(config, { ...baseOptions, plan: 'annual' })
    const body = requestBody(f)
    expect(body.data.attributes.product_options.enabled_variants).toEqual([222])
    expect(body.data.relationships.variant.data.id).toBe('222')
  })

  it('with discountCode → attaches checkout_data.discount_code (LS documented shape)', async () => {
    const f = mockFetchOk()
    vi.stubGlobal('fetch', f)
    await createCheckoutSession(config, {
      ...baseOptions,
      plan: 'monthly',
      discountCode: 'LAUNCH-MONTHLY',
    })
    const body = requestBody(f)
    expect(body.data.attributes.checkout_data.discount_code).toBe('LAUNCH-MONTHLY')
    // must NOT be attached as a relationship — that shape is ignored by LS
    expect(body.data.relationships).not.toHaveProperty('discount')
  })

  it('without discountCode → no discount_code key in checkout_data', async () => {
    const f = mockFetchOk()
    vi.stubGlobal('fetch', f)
    await createCheckoutSession(config, { ...baseOptions, plan: 'monthly' })
    const body = requestBody(f)
    expect(body.data.attributes.checkout_data).not.toHaveProperty('discount_code')
  })

  it('returns the checkout url from the LS response', async () => {
    const f = mockFetchOk()
    vi.stubGlobal('fetch', f)
    const { url } = await createCheckoutSession(config, { ...baseOptions, plan: 'monthly' })
    expect(url).toBe('https://cx/abc')
  })
})
