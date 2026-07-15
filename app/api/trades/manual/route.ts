import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildExecutions, manualLegsSchema } from '@/lib/trade/manual-entry'
import { persistManualLegs } from '@/lib/trade/persist-manual-legs'
import type { ManualLeg } from '@/lib/trade/manual-entry'
import {
  getUserTier,
  isProTier,
  getUserTradeCount,
  tradeLimitReachedResponse,
  MANUAL_TRADE_LIMIT_FREE,
} from '@/lib/billing/tier'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tier } = await getUserTier(user.id)
  if (!isProTier(tier)) {
    const currentCount = await getUserTradeCount(user.id)
    if (currentCount >= MANUAL_TRADE_LIMIT_FREE) {
      return tradeLimitReachedResponse(currentCount, MANUAL_TRADE_LIMIT_FREE)
    }
  }

  let legs: ManualLeg[]
  try {
    const body = await req.json()
    const parsed = manualLegsSchema.safeParse(body?.legs)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }
    legs = parsed.data as ManualLeg[]
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Pre-validate so a malformed batch returns 422 before any DB write. This
  // preserves the manual route's strict all-or-nothing contract (the shared
  // persistManualLegs helper drops invalid legs silently for partial imports).
  const { errors } = buildExecutions(legs)
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', details: errors },
      { status: 422 }
    )
  }

  const { processed, skipped, failed, errors: errMsgs } = await persistManualLegs(legs, user.id)

  return NextResponse.json({ processed, skipped, failed, errors: errMsgs })
}
