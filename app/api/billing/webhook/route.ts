import { NextResponse } from 'next/server'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getLemonSqueezyConfig,
  HANDLED_EVENTS,
  isActiveStatus,
  type HandledEvent,
  type WebhookPayload,
} from '@/lib/billing/lemon-squeezy'
import { logAuditEvent } from '@/lib/audit/log'

const uuidSchema = z.string().uuid()

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
    console.warn('[billing/webhook] missing X-Signature header')
    return NextResponse.json({ error: 'missing signature' }, { status: 401 })
  }

  // X11: shape check BEFORE timingSafeEqual. LS always sends 64-char lowercase
  // hex; an odd-length or non-hex header would truncate silently inside
  // Buffer.from(sig,'hex') and then throw ERR_CRYPTO_TIMING_SAFE_EQUAL_WRONG_LENGTH,
  // making a mis-configured caller and a genuine wrong-key signature look
  // identical in the logs. Distinguishing the two is the whole point of the
  // three-branch log strategy below.
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) {
    console.warn(`[billing/webhook] malformed X-Signature length=${signatureHeader.length}`)
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
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
    console.warn('[billing/webhook] invalid signature')
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

  // X9: LS may send synthetic non-UUID ids in test-mode payloads or custom
  // custom_data fields. Passing them straight to .eq('id', <userId>) triggers
  // Postgres 22P02, which we return as 500 → LS retries forever until manually
  // acked. Detect the shape early, ack with 200 (so LS stops), and record the
  // anomaly for the operator.
  if (!uuidSchema.safeParse(userId).success) {
    console.warn('[billing/webhook] non-UUID user_id ignored:', userId, 'event:', eventName)
    return NextResponse.json({ ok: true, ignored: 'invalid user_id' })
  }

  const admin = createAdminClient()

  // X5: idempotency. sha256(rawBody) is stable across LS retries of the same
  // delivery attempt, so an INSERT on the UNIQUE event_id column short-circuits
  // duplicate deliveries at the DB layer. We attempt the INSERT before touching
  // User state — if it succeeds we own the write; if it fails with 23505 we ack
  // 200 without re-writing.
  const eventId = createHash('sha256').update(rawBody).digest('hex')
  const { error: insertErr } = await admin
    .from('BillingWebhookEvent')
    .insert({ event_id: eventId, event_name: eventName })

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Duplicate delivery — already processed. Ack so LS moves on.
      console.info('[billing/webhook] duplicate event acked:', eventName, eventId.slice(0, 12))
      return NextResponse.json({ ok: true, duplicate: true })
    }
    // Genuine DB error inserting the ledger row — do NOT proceed to User update.
    // Return 500 so LS retries; on the retry the next attempt gets the same
    // event_id so idempotency still holds.
    console.error('[billing/webhook] failed to insert BillingWebhookEvent:', insertErr.message)
    return NextResponse.json({ error: 'db insert failed' }, { status: 500 })
  }

  const subscriptionId = payload.data.id
  const customerId = String(payload.data.attributes.customer_id ?? '')
  const status = payload.data.attributes.status
  const renewsAt = payload.data.attributes.renews_at

  const newTier = isActiveStatus(status) ? 'Pro' : 'Free'

  const { data: prior } = await admin
    .from('User')
    .select('subscriptionTier')
    .eq('id', userId)
    .maybeSingle()

  // X14: use .select('id') on the update so we can detect zero-row responses
  // — happens when the user_id is a valid UUID but no matching row exists
  // (account deleted between checkout and this webhook, test-mode leak, race).
  const { data: updated, error } = await admin
    .from('User')
    .update({
      subscriptionTier: newTier,
      subscriptionStatus: status,
      subscriptionRenewsAt: renewsAt,
      lemonsqueezySubscriptionId: subscriptionId,
      lemonsqueezyCustomerId: customerId || null,
    })
    .eq('id', userId)
    .select('id')

  if (error) {
    console.error('[billing/webhook] failed to update user:', error.message)
    return NextResponse.json({ error: 'db update failed' }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    console.error('[billing/webhook] orphaned event — no User row for user_id:', userId, 'event:', eventName, 'lsSubscription:', subscriptionId)
    await logAuditEvent({
      userId,
      eventType: 'subscription_orphaned',
      status: 'failure',
      metadata: {
        lsEvent: eventName,
        lsSubscriptionId: subscriptionId,
        note: 'user_id valid UUID but no matching User row',
      },
      request,
    })
    // Ack 200 so LS doesn't retry the orphan forever. The audit row is the
    // operator-visible signal that billing<->user state has diverged.
    return NextResponse.json({ ok: true, ignored: 'user_not_found' })
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
