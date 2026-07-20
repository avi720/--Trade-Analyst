import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  adminAuthErrorResponse,
} from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

const uuidSchema = z.string().uuid()

const FAKE_RENEWAL_DAYS = 30

// POST /api/admin/users/[userId]/toggle-tier
// Flips subscriptionTier Free<->Pro on the target user. Also writes a
// matching fake subscriptionStatus / subscriptionRenewsAt so the profile
// billing tab stays coherent. Never touches lemonsqueezyCustomerId /
// lemonsqueezySubscriptionId — a real webhook can still overwrite the fake
// state cleanly.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdmin()
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

  return NextResponse.json({
    tier: nextTier,
    status: nextStatus,
    renewsAt: nextRenewsAt,
  })
}
