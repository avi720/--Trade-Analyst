import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildExecutions, extractAnnotations } from '@/lib/trade/manual-entry'
import { processExecutions } from '@/lib/ibkr/process-executions'
import type { ManualLeg } from '@/lib/trade/manual-entry'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let legs: ManualLeg[]
  try {
    const body = await req.json()
    legs = body.legs
    if (!Array.isArray(legs) || legs.length === 0) {
      return NextResponse.json({ error: 'legs must be a non-empty array' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { executions, errors } = buildExecutions(legs)

  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', details: errors },
      { status: 422 }
    )
  }

  const results = await processExecutions(executions, user.id)

  // Apply Trade-level annotation fields for each successfully processed leg.
  // Uses service-role client (admin) so RLS doesn't interfere with the update,
  // but we still filter by userId to ensure we only touch this user's trades.
  const admin = createAdminClient()
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    const ticker = leg.ticker.trim().toUpperCase()
    const executedAt = new Date(`${leg.date}T${leg.time}:00Z`)
    const execId = `MANUAL-${ticker}-${executedAt.getTime()}-${i}`
    const result = results.find(r => r.brokerExecId === execId && r.status === 'PROCESSED')
    if (!result?.tradeId) continue

    const annotations = extractAnnotations(leg)
    if (Object.keys(annotations).length === 0) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await admin
      .from('Trade')
      .update(annotations as any)
      .eq('id', result.tradeId)
      .eq('userId', user.id)
  }

  const processed = results.filter(r => r.status === 'PROCESSED').length
  const skipped   = results.filter(r => r.status === 'SKIPPED_DUPLICATE').length
  const failed    = results.filter(r => r.status === 'FAILED').length
  const errMsgs   = results.filter(r => r.status === 'FAILED').map(r => `${r.brokerExecId}: ${r.error}`)

  return NextResponse.json({ processed, skipped, failed, errors: errMsgs })
}
