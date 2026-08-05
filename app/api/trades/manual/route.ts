import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildExecutions, manualLegsSchema } from '@/lib/trade/manual-entry'
import { persistManualLegs } from '@/lib/trade/persist-manual-legs'
import {
  findForbiddenLegs,
  forbiddenLegMessage,
  loadOpenSnapshots,
} from '@/lib/trade/guard-position-mutations'
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
  const { executions, errors } = buildExecutions(legs)
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', details: errors },
      { status: 422 }
    )
  }

  // This route opens positions — nothing else. Touching a position that already
  // exists (scale-in, trim, close, reverse) belongs to the dedicated modals in
  // the search tab, which capture the context those actions need. Rejected
  // all-or-nothing, before any write, matching the route's existing contract.
  // Read through the RLS-bound client so the guard can only ever see this
  // user's own positions.
  const openByTicker = await loadOpenSnapshots(
    supabase,
    user.id,
    executions.map((e) => e.ticker)
  )
  const forbidden = findForbiddenLegs(executions, openByTicker)
  if (forbidden.length > 0) {
    const legErrors = forbidden.map(forbiddenLegMessage)
    return NextResponse.json(
      {
        error: legErrors[0],
        legErrors,
        forbiddenLegs: forbidden,
      },
      { status: 422 }
    )
  }

  const { processed, skipped, failed, errors: errMsgs } = await persistManualLegs(legs, user.id)

  return NextResponse.json({ processed, skipped, failed, errors: errMsgs })
}
