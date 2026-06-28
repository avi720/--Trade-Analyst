export interface LemonSqueezyConfig {
  apiKey: string
  storeId: string
  variantIdMonthly: string
  variantIdAnnual: string
  webhookSecret: string
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
  return { apiKey, storeId, variantIdMonthly, variantIdAnnual, webhookSecret }
}

export type BillingPlan = 'monthly' | 'annual'

export interface CheckoutOptions {
  plan: BillingPlan
  userId: string
  userEmail: string
  successUrl: string
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

  const payload = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: options.userEmail,
          custom: {
            user_id: options.userId,
          },
        },
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
// Lemon Squeezy uses: on_trial, active, paused, past_due, unpaid, cancelled, expired
export function isActiveStatus(status: string): boolean {
  return status === 'on_trial' || status === 'active' || status === 'past_due'
}
