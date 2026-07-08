import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  getLemonSqueezyConfig,
  createCheckoutSession,
  isLaunchPromoActive,
  type BillingPlan,
} from '@/lib/billing/lemon-squeezy'
import { getBaseUrl } from '@/lib/utils'
import { checkRateLimit, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { logAuditEvent } from '@/lib/audit/log'

const schema = z.object({
  plan: z.enum(['monthly', 'annual']),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // X8: LS rejects checkouts without an email (or creates an orphan checkout
  // that breaks receipt delivery). Rare edge case — magic-link / OAuth flows
  // where the user record lacks a verified email — but the failure is
  // undebuggable from the user's side ("יצירת מנוי נכשלה" with no cue what to
  // fix). Short-circuit with a specific instruction to complete profile first.
  if (!user.email) {
    return NextResponse.json(
      { error: 'כתובת מייל חסרה בחשבון. אנא השלם את פרטי הפרופיל לפני הרשמה למנוי.' },
      { status: 400 },
    )
  }

  // Rate limit: each call fires a signed request to Lemon Squeezy's checkout API
  // with the owner's store-wide API key. Without this cap, a single authenticated
  // account could loop the endpoint and exhaust the LS 120 req/min store limit,
  // DoS-ing the payment flow for everyone. Two buckets — 10/hr for burst,
  // 30/day for sustained abuse.
  const rlHour = await checkRateLimit(`user:${user.id}:billing-checkout`, 10, 3600)
  if (!rlHour.ok) {
    await logAuditEvent({
      userId: user.id,
      eventType: 'rate_limit_hit',
      status: 'failure',
      metadata: { action: 'billing_checkout', bucket: 'hourly' },
      request,
    })
    return rateLimitedResponse(rlHour, 'יותר מדי ניסיונות תשלום. נסה שוב בעוד שעה')
  }

  const rlDay = await checkRateLimit(`user:${user.id}:billing-checkout:daily`, 30, 86400)
  if (!rlDay.ok) {
    await logAuditEvent({
      userId: user.id,
      eventType: 'rate_limit_hit',
      status: 'failure',
      metadata: { action: 'billing_checkout', bucket: 'daily' },
      request,
    })
    return rateLimitedResponse(rlDay, 'הגעת למגבלת ניסיונות התשלום היומית. נסה שוב מחר')
  }

  const config = getLemonSqueezyConfig()
  if (!config) {
    return NextResponse.json(
      { error: 'התשלומים עדיין לא הופעלו. נסה שוב מאוחר יותר.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const plan: BillingPlan = parsed.data.plan
  const successUrl = `${getBaseUrl()}/profile?tab=billing&checkout=success`

  let discountCode: string | undefined
  if (isLaunchPromoActive()) {
    const code = plan === 'monthly'
      ? config.discountCodeLaunchMonthly
      : config.discountCodeLaunchAnnual
    if (code) discountCode = code
  }

  try {
    const { url } = await createCheckoutSession(config, {
      plan,
      userId: user.id,
      userEmail: user.email, // Guaranteed present — validated at top of handler (X8).
      successUrl,
      discountCode,
    })
    return NextResponse.json({ url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[billing/checkout] failed:', msg)
    return NextResponse.json(
      { error: 'יצירת מנוי נכשלה. נסה שוב או צור קשר עם התמיכה.' },
      { status: 500 },
    )
  }
}
