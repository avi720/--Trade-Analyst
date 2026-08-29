import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  adminAuthErrorResponse,
} from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit/log'

const uuidSchema = z.string().uuid()

const FAKE_RENEWAL_DAYS = 30

// POST /api/admin/users/[userId]/toggle-tier
// Flips subscriptionTier Free<->Pro on the target user. Also writes a
// matching fake subscriptionStatus / subscriptionRenewsAt so the profile
// billing tab stays coherent. Never touches lemonsqueezyCustomerId /
// lemonsqueezySubscriptionId — a real webhook can still overwrite the fake
// state cleanly, and billing/pause + billing/resume read that column and hand
// it straight to the LS API, so a synthetic id would turn their clean 400
// ("no active subscription") into a 502 against a subscription LS never had.
//
// Writes an AuditEvent because this is the only path that grants Pro without a
// payment. No BillingWebhookEvent row: that table is the LS delivery-dedup
// ledger keyed on sha256(rawBody), and there is no LS delivery to dedup here.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  let actorId: string
  try {
    const { user } = await requireAdmin()
    actorId = user.id
  } catch (err) {
    const resp = adminAuthErrorResponse(err)
    if (resp) return resp
    throw err
  }

  const { userId } = await params
  if (!uuidSchema.safeParse(userId).success) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: current, error: readError } = await admin
    .from('User')
    .select('subscriptionTier')
    .eq('id', userId)
    .maybeSingle()

  if (readError) {
    console.error('[admin/toggle-tier] read failed:', readError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const nextTier = current.subscriptionTier === 'Pro' ? 'Free' : 'Pro'
  const nextStatus = nextTier === 'Pro' ? 'active' : 'cancelled'
  const nextRenewsAt =
    nextTier === 'Pro'
      ? new Date(
          Date.now() + FAKE_RENEWAL_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null

  const { error: updateError } = await admin
    .from('User')
    .update({
      subscriptionTier: nextTier,
      subscriptionStatus: nextStatus,
      subscriptionRenewsAt: nextRenewsAt,
    })
    .eq('id', userId)

  if (updateError) {
    console.error('[admin/toggle-tier] update failed:', updateError.message)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  // `userId` is the subject of the event — the user whose tier moved — matching
  // how the LS webhook logs it; the admin who pulled the lever rides in
  // metadata. Reuses tier_upgraded / tier_downgraded instead of a new event
  // type (which would need a migration to audit_event_type_check); the
  // `source` field is what separates a manual grant from a webhook-driven one.
  await logAuditEvent({
    userId,
    eventType: nextTier === 'Pro' ? 'tier_upgraded' : 'tier_downgraded',
    status: 'success',
    metadata: {
      source: 'admin_toggle',
      actorId,
      priorTier: current.subscriptionTier,
      nextTier,
      nextStatus,
    },
    request,
  })

  return NextResponse.json({
    tier: nextTier,
    status: nextStatus,
    renewsAt: nextRenewsAt,
  })
}
