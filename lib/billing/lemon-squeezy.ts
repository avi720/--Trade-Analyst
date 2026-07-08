export interface LemonSqueezyConfig {
  apiKey: string
  storeId: string
  variantIdMonthly: string
  variantIdAnnual: string
  webhookSecret: string
  discountCodeLaunchMonthly: string | null
  discountCodeLaunchAnnual: string | null
}

// LAUNCH_PROMO_END + isLaunchPromoActive moved to lib/billing/prices.ts (X16 —
// single source of truth for pricing + promo date). Re-exported here so existing
// callers (webhook route, checkout route) keep working; new code should import
// directly from lib/billing/prices.ts.
export { LAUNCH_PROMO_END, isLaunchPromoActive } from './prices'

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

// X21 — cancel a subscription at Lemon Squeezy.
//
// Called from the account-deletion flow before we delete the app-level User
// row (which cascades to the auth identity). The audit finding rationale: it
// is unethical to keep charging a subscription tied to an account that no
// longer exists in our DB. LS supports two shapes for cancellation — PATCH
// with `cancelled:true` and DELETE. PATCH is the canonical shape per the audit
// acceptance; both produce the same subscription state on LS's side.
//
// The cancellation is "cancel at period end" — LS honors the paid period the
// user already paid for. This matches the X6 owner decision (0-day dunning):
// user's paid period is honored, then Free.
//
// Return shape lets the caller distinguish "already cancelled" from a real
// failure so the UI can react appropriately.
export type LemonSqueezyCancelResult =
  | { ok: true }
  | { ok: false; status: number; body: string }

export async function cancelSubscription(
  config: LemonSqueezyConfig,
  subscriptionId: string,
): Promise<LemonSqueezyCancelResult> {
  const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'subscriptions',
        id: subscriptionId,
        attributes: { cancelled: true },
      },
    }),
  })

  if (res.ok) return { ok: true }
  const body = await res.text().catch(() => '')
  return { ok: false, status: res.status, body: body.slice(0, 500) }
}

// X22 — pause / resume a subscription at Lemon Squeezy.
//
// LS supports customer-initiated pause via its own portal. This helper lets us
// surface the same action from `/profile?tab=billing` so users don't have to
// leave the app. Pause with `mode: 'void'` means the subscription stops
// billing entirely during the pause window (as opposed to `mode: 'free'`
// which continues delivery without billing). Void matches the owner's intent
// — paused users become Free until they resume.
//
// The webhook fires `subscription_paused` on pause and `subscription_resumed`
// on resume; those flows already downgrade / upgrade `subscriptionTier`
// correctly via `isActiveStatus`.

export type LemonSqueezyMutateResult = LemonSqueezyCancelResult

async function patchSubscription(
  config: LemonSqueezyConfig,
  subscriptionId: string,
  attributes: Record<string, unknown>,
): Promise<LemonSqueezyMutateResult> {
  const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      data: { type: 'subscriptions', id: subscriptionId, attributes },
    }),
  })
  if (res.ok) return { ok: true }
  const body = await res.text().catch(() => '')
  return { ok: false, status: res.status, body: body.slice(0, 500) }
}

export function pauseSubscription(
  config: LemonSqueezyConfig,
  subscriptionId: string,
): Promise<LemonSqueezyMutateResult> {
  return patchSubscription(config, subscriptionId, { pause: { mode: 'void' } })
}

export function resumeSubscription(
  config: LemonSqueezyConfig,
  subscriptionId: string,
): Promise<LemonSqueezyMutateResult> {
  // Setting pause to null clears the pause; LS resumes immediately.
  return patchSubscription(config, subscriptionId, { pause: null })
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
