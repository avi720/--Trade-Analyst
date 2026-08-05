import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { manualLegsSchema, type ManualLeg } from '@/lib/trade/manual-entry'
import { persistManualLegs } from '@/lib/trade/persist-manual-legs'
import { getUserTier, isProTier, proRequiredResponse } from '@/lib/billing/tier'

/**
 * Commits the legs the user reviewed in the Excel-import preview.
 *
 * Why this exists instead of reusing POST /api/trades/manual: that route is the
 * manual-entry tab's endpoint and enforces the opening-only guard (it may only
 * OPEN positions — see lib/trade/guard-position-mutations.ts). A spreadsheet
 * legitimately carries closing rows: one row per execution means every BUY row
 * has a matching SELL row for any trade that actually closed. Routing the
 * import through the guarded endpoint would silently drop every exit.
 *
 * Pro-gated to match POST /api/trades/import, which produced the preview.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tier } = await getUserTier(user.id)
  if (!isProTier(tier)) {
    return proRequiredResponse('excel_import')
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

  const { processed, skipped, failed, errors, validationErrors } =
    await persistManualLegs(legs, user.id)

  return NextResponse.json({
    processed,
    skipped,
    failed,
    errors: [
      ...errors,
      ...validationErrors.map((e) => `${e.field}: ${e.message}`),
    ],
  })
}
