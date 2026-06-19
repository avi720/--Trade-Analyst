import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildExecutions, extractAnnotations, manualLegsSchema } from '@/lib/trade/manual-entry'
import { processExecutions } from '@/lib/ibkr/process-executions'
import { recomputeActualR } from '@/lib/trade/recompute-actual-r'
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

  const { executions, errors } = buildExecutions(legs)

  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', details: errors },
      { status: 422 }
    )
  }

  const results = await processExecutions(executions, user.id)

  // Apply Trade-level annotation fields for each successfully processed leg,
  // and tag any Trade whose first Order is a MANUAL- exec with source='manual'.
  const admin = createAdminClient()
  const tradeIds = new Set<string>()
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    const ticker = leg.ticker.trim().toUpperCase()
    const executedAt = new Date(`${leg.date}T${leg.time}:00Z`)
    if (!Number.isFinite(executedAt.getTime())) continue
    const execId = `MANUAL-${ticker}-${executedAt.getTime()}-${i}`
    const result = results.find(r => r.brokerExecId === execId && r.status === 'PROCESSED')
    if (!result?.tradeId) continue
    tradeIds.add(result.tradeId)

    const annotations = extractAnnotations(leg)
    if (Object.keys(annotations).length === 0) continue

    await admin
      .from('Trade')
      .update(annotations)
      .eq('id', result.tradeId)
      .eq('userId', user.id)
  }

  // Tag manual-source trades. We only flip a Trade to source='manual' if its
  // earliest Order has a MANUAL-* brokerExecId (so manual closes of broker
  // trades don't overwrite the origin tag).
  for (const tradeId of tradeIds) {
    const { data: firstOrder } = await admin
      .from('Order')
      .select('brokerExecId')
      .eq('tradeId', tradeId)
      .order('executedAt', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (firstOrder?.brokerExecId?.startsWith('MANUAL-')) {
      await admin
        .from('Trade')
        .update({ source: 'manual' })
        .eq('id', tradeId)
        .eq('userId', user.id)
    }
  }

  // If a leg's stopPrice annotation was applied after its trade already closed
  // in this same submission (e.g. open + close legs together), the CLOSE action
  // computed actualR = null. Recompute now that the stop is persisted.
  for (const tradeId of tradeIds) {
    await recomputeActualR(admin, tradeId, user.id)
  }

  const processed = results.filter(r => r.status === 'PROCESSED').length
  const skipped   = results.filter(r => r.status === 'SKIPPED_DUPLICATE').length
  const failed    = results.filter(r => r.status === 'FAILED').length
  const errMsgs   = results.filter(r => r.status === 'FAILED').map(r => `${r.brokerExecId}: ${r.error}`)

  return NextResponse.json({ processed, skipped, failed, errors: errMsgs })
}
