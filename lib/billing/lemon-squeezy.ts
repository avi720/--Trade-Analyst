export interface LemonSqueezyConfig {
  apiKey: string
  storeId: string
  variantIdMonthly: string
  variantIdAnnual: string
  webhookSecret: string
  discountCodeLaunchMonthly: string | null
  discountCodeLaunchAnnual: string | null
}

export const LAUNCH_PROMO_END = new Date('2026-08-01T00:00:00Z')

export function isLaunchPromoActive(): boolean {
  return Date.now() < LAUNCH_PROMO_END.getTime()
}

export function getLemonSqueezyConfig(): LemonSqueezyConfig | null {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY
  const storeId = process.env.LEMONSQUEEZY_STORE_ID
  const variantIdMonthly = process.env.LEMONSQUEEZY_VARIANT_ID_MONTHLY
  const variantIdAnnual = process.env.LEMONSQUEEZY_VARIANT_ID_ANNUAL
  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET

  if (!apiKey || !storeId || !variantIdMonthly || !variantIdAnnual || !webhookSecret) {
    return null
  }
  return {
    apiKey,
    storeId,
    variantIdMonthly,
    variantIdAnnual,
    webhookSecret,
    discountCodeLaunchMonthly: process.env.LEMONSQUEEZY_DISCOUNT_CODE_LAUNCH_MONTHLY ?? null,
    discountCodeLaunchAnnual: process.env.LEMONSQUEEZY_DISCOUNT_CODE_LAUNCH_ANNUAL ?? null,
  }
}

export type BillingPlan = 'monthly' | 'annual'

export interface CheckoutOptions {
  plan: BillingPlan
  userId: string
  userEmail: string
  successUrl: string
  discountCode?: string
}

interface CheckoutResponse {
  url: string
}

export async function createCheckoutSession(
  config: LemonSqueezyConfig,
  options: CheckoutOptions,
): Promise<CheckoutResponse> {
  const variantId =
    options.plan === 'monthly' ? config.variantIdMonthly : config.variantIdAnnual

  const checkoutData: Record<string, unknown> = {
    email: options.userEmail,
    custom: {
      user_id: options.userId,
    },
  }
  if (options.discountCode) {
    checkoutData.discount_code = options.discountCode
  }

  const payload = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: checkoutData,
        product_options: {
          redirect_url: options.successUrl,
          enabled_variants: [Number(variantId)],
        },
      },
      relationships: {
        store: { data: { type: 'stores', id: config.storeId } },
        variant: { data: { type: 'variants', id: variantId } },
      },
    },
  }

  const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`lemonsqueezy checkout failed: ${res.status} ${text}`)
  }

  const json = (await res.json()) as {
    data: { attributes: { url: string } }
  }
  return { url: json.data.attributes.url }
}

// Subscription webhook events we care about.
// Reference: https://docs.lemonsqueezy.com/help/webhooks/event-types
export const HANDLED_EVENTS = [
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
] as const

export type HandledEvent = (typeof HANDLED_EVENTS)[number]

export interface WebhookSubscriptionData {
  id: string
  attributes: {
    status: string
    customer_id: number
    renews_at: string | null
    ends_at: string | null
  }
  meta?: {
    custom_data?: { user_id?: string }
  }
}

export interface WebhookPayload {
  meta: {
    event_name: string
    custom_data?: { user_id?: string }
  }
  data: WebhookSubscriptionData
}

// Active subscription statuses that grant Pro tier.
// Lemon Squeezy uses: on_trial, active, paused, past_due, unpaid, cancelled, expired.
//
// X6 (owner decision 2026-07-07 — 0-day dunning): user paid for period P; while
// `active`/`on_trial` they get Pro. When renewal fails and status flips to
// `past_due`, the paid period is already over — they immediately drop to Free.
// This keeps failed-card users from extracting weeks of Gemini-2.5-pro chat via
// LS's default 14-day dunning window before the transition to `unpaid`/`expired`
// fires and the webhook downgrades them.
export function isActiveStatus(status: string): boolean {
  return status === 'on_trial' || status === 'active'
}
