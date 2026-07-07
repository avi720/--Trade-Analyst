import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export type SubscriptionTier = 'Free' | 'Pro'

export interface UserTierInfo {
  tier: SubscriptionTier
  status: string | null
  renewsAt: string | null
}

export async function getUserTier(userId: string): Promise<UserTierInfo> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('User')
    .select('subscriptionTier, subscriptionStatus, subscriptionRenewsAt')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    // Fail-closed for unknown users; treat as Free.
    return { tier: 'Free', status: null, renewsAt: null }
  }

  const tier: SubscriptionTier = data.subscriptionTier === 'Pro' ? 'Pro' : 'Free'
  return {
    tier,
    status: data.subscriptionStatus,
    renewsAt: data.subscriptionRenewsAt,
  }
}

export function isProTier(tier: SubscriptionTier): boolean {
  return tier === 'Pro'
}

// Returns a structured 403 response that the client can detect (errorCode='pro_required')
// to render the upgrade prompt rather than a generic error.
export function proRequiredResponse(feature: string): NextResponse {
  return NextResponse.json(
    {
      error: 'תכונה זו זמינה במסלול Pro בלבד',
      errorCode: 'pro_required',
      feature,
    },
    { status: 403 },
  )
}

// Free tier caps manual trade entry at this many Trade rows (open + closed).
// Beyond this, POST /api/trades/manual returns errorCode='trade_limit_reached'.
export const MANUAL_TRADE_LIMIT_FREE = 30

export async function getUserTradeCount(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('Trade')
    .select('*', { count: 'exact', head: true })
    .eq('userId', userId)
  return count ?? 0
}

export function tradeLimitReachedResponse(current: number, limit: number): NextResponse {
  return NextResponse.json(
    {
      error: `הגעת למגבלת המסלול החינמי (${limit} טריידים). שדרג ל-Pro להסרת המגבלה.`,
      errorCode: 'trade_limit_reached',
      current,
      limit,
    },
    { status: 403 },
  )
}
