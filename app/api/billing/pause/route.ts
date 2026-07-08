import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { logAuditEvent } from '@/lib/audit/log'
import { getLemonSqueezyConfig, pauseSubscription } from '@/lib/billing/lemon-squeezy'

/**
 * X22 — pause the caller's Lemon Squeezy subscription (customer-initiated hold).
 *
 * Authenticated per-user. Rate-limited to prevent flip-flopping and to protect
 * the LS store-wide 120 req/min budget. `lemonsqueezySubscriptionId` is
 * looked up server-side from the User row — the client never sends it, so a
 * user cannot pause someone else's subscription.
 *
 * The webhook (subscription_paused) will downgrade tier to Free on the next
 * event delivery — that path is already correct via isActiveStatus.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Shared bucket with resume — flipping between the two shouldn't burn quota
  // separately, but 20 combined pauses+resumes per hour is more than any
  // legitimate use case would ever need.
  const rl = await checkRateLimit(`user:${user.id}:billing-state`, 20, 3600)
  if (!rl.ok) {
    await logAuditEvent({
      userId: user.id,
      eventType: 'rate_limit_hit',
      status: 'failure',
      metadata: { action: 'billing_pause' },
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
    return NextResponse.json({ error: 'לא נמצא מנוי פעיל' }, { status: 400 })
  }

  const result = await pauseSubscription(config, subscriptionId)
  if (!result.ok) {
    console.error('[billing/pause] LS pause failed:', result.status, result.body, 'subId:', subscriptionId)
    return NextResponse.json(
      { error: 'השהיית המנוי נכשלה. נסה שוב או פנה לתמיכה.' },
      { status: 502 },
    )
  }

  await logAuditEvent({
    userId: user.id,
    eventType: 'subscription_updated',
    status: 'success',
    metadata: { action: 'billing_pause', lsSubscriptionId: subscriptionId },
    request,
  })

  return NextResponse.json({ ok: true })
}
