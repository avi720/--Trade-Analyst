import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getLemonSqueezyConfig,
  HANDLED_EVENTS,
  isActiveStatus,
  type HandledEvent,
  type WebhookPayload,
} from '@/lib/billing/lemon-squeezy'
import { logAuditEvent } from '@/lib/audit/log'

export async function POST(request: Request) {
  const config = getLemonSqueezyConfig()
  if (!config) {
    // Idempotent ack — Lemon Squeezy will keep retrying otherwise. When the
    // owner enables billing later, replay is acceptable since each event will
    // resolve to the latest subscription state anyway.
    return NextResponse.json({ ok: true, note: 'billing not configured' })
  }

  const rawBody = await request.text()
  const signatureHeader = request.headers.get('X-Signature')
  if (!signatureHeader) {
    return NextResponse.json({ error: 'missing signature' }, { status: 401 })
  }

  const expected = createHmac('sha256', config.webhookSecret).update(rawBody).digest('hex')
  let signatureValid = false
  try {
    signatureValid = timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signatureHeader, 'hex'),
    )
  } catch {
    signatureValid = false
  }
  if (!signatureValid) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody) as WebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const eventName = payload.meta?.event_name
  if (!HANDLED_EVENTS.includes(eventName as HandledEvent)) {
    // Acknowledge unhandled events so LS doesn't retry.
    return NextResponse.json({ ok: true, ignored: eventName })
  }

  const userId =
    payload.meta?.custom_data?.user_id ?? payload.data?.meta?.custom_data?.user_id

  if (!userId) {
    console.error('[billing/webhook] event missing user_id:', eventName)
    return NextResponse.json({ error: 'missing user_id' }, { status: 400 })
  }

  const subscriptionId = payload.data.id
  const customerId = String(payload.data.attributes.customer_id ?? '')
  const status = payload.data.attributes.status
  const renewsAt = payload.data.attributes.renews_at

  const newTier = isActiveStatus(status) ? 'Pro' : 'Free'

  const admin = createAdminClient()
  const { data: prior } = await admin
    .from('User')
    .select('subscriptionTier')
    .eq('id', userId)
    .maybeSingle()

  const { error } = await admin
    .from('User')
    .update({
      subscriptionTier: newTier,
      subscriptionStatus: status,
      subscriptionRenewsAt: renewsAt,
      lemonsqueezySubscriptionId: subscriptionId,
      lemonsqueezyCustomerId: customerId || null,
    })
    .eq('id', userId)

  if (error) {
    console.error('[billing/webhook] failed to update user:', error.message)
    return NextResponse.json({ error: 'db update failed' }, { status: 500 })
  }

  await logAuditEvent({
    userId,
    eventType:
      prior?.subscriptionTier === newTier
        ? 'subscription_updated'
        : newTier === 'Pro'
          ? 'tier_upgraded'
          : 'tier_downgraded',
    status: 'success',
    metadata: {
      lsEvent: eventName,
      lsStatus: status,
      lsSubscriptionId: subscriptionId,
    },
    request,
  })

  return NextResponse.json({ ok: true })
}
