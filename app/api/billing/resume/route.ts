import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { logAuditEvent } from '@/lib/audit/log'
import { getLemonSqueezyConfig, resumeSubscription } from '@/lib/billing/lemon-squeezy'

/**
 * X22 — resume a paused Lemon Squeezy subscription.
 *
 * Same auth + rate-limit + lookup pattern as /api/billing/pause; the
 * subscription id is fetched server-side from the User row so a caller
 * cannot resume someone else's subscription. The webhook
 * (subscription_resumed) will restore Pro tier on the next event delivery.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit(`user:${user.id}:billing-state`, 20, 3600)
  if (!rl.ok) {
    await logAuditEvent({
      userId: user.id,
      eventType: 'rate_limit_hit',
      status: 'failure',
      metadata: { action: 'billing_resume' },
      request,
    })
    return rateLimitedResponse(rl, 'יותר מדי בקשות. נסה שוב בעוד שעה')
  }

  const config = getLemonSqueezyConfig()
  if (!config) {
    return NextResponse.json({ error: 'התשלומים אינם פעילים' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { data: userRow } = await admin
    .from('User')
    .select('lemonsqueezySubscriptionId')
    .eq('id', user.id)
    .maybeSingle()

  const subscriptionId = userRow?.lemonsqueezySubscriptionId
  if (!subscriptionId) {
    return NextResponse.json({ error: 'לא נמצא מנוי להפעלה' }, { status: 400 })
  }

  const result = await resumeSubscription(config, subscriptionId)
  if (!result.ok) {
    console.error('[billing/resume] LS resume failed:', result.status, result.body, 'subId:', subscriptionId)
    return NextResponse.json(
      { error: 'הפעלת המנוי מחדש נכשלה. נסה שוב או פנה לתמיכה.' },
      { status: 502 },
    )
  }

  await logAuditEvent({
    userId: user.id,
    eventType: 'subscription_updated',
    status: 'success',
    metadata: { action: 'billing_resume', lsSubscriptionId: subscriptionId },
    request,
  })

  return NextResponse.json({ ok: true })
}
