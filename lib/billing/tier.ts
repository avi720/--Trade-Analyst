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
