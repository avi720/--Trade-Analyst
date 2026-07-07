import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildExecutions, extractAnnotations, manualLegsSchema } from '@/lib/trade/manual-entry'
import type { TablesUpdate } from '@/lib/db/types'
import { processExecutions } from '@/lib/ibkr/process-executions'
import { recomputeActualR } from '@/lib/trade/recompute-actual-r'
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

  const { executions, errors } = buildExecutions(legs)

  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', details: errors },
      { status: 422 }
    )
  }

  const results = await processExecutions(executions, user.id)

  const admin = createAdminClient()
  const resultByExecId = new Map(results.map(r => [r.brokerExecId, r]))
  const tradeIds = new Set<string>()
  const annotationsByTradeId = new Map<string, TablesUpdate<'Trade'>>()

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    const ticker = leg.ticker.trim().toUpperCase()
    const executedAt = new Date(`${leg.date}T${leg.time}:00Z`)
    if (!Number.isFinite(executedAt.getTime())) continue
    const execId = `MANUAL-${ticker}-${executedAt.getTime()}-${i}`
    const result = resultByExecId.get(execId)
    if (!result || result.status !== 'PROCESSED' || !result.tradeId) continue
    tradeIds.add(result.tradeId)

    const annotations = extractAnnotations(leg)
    if (Object.keys(annotations).length === 0) continue
    // Last-leg-wins merge preserves the sequential loop's overwrite semantics.
    const merged = annotationsByTradeId.get(result.tradeId) ?? {}
    annotationsByTradeId.set(result.tradeId, { ...merged, ...annotations })
  }

  await Promise.allSettled(
    Array.from(annotationsByTradeId.entries()).map(([tradeId, annotations]) =>
      admin
        .from('Trade')
        .update(annotations)
        .eq('id', tradeId)
        .eq('userId', user.id)
    )
  )

  // Tag manual-source trades. We only flip a Trade to source='manual' if its
  // earliest Order has a MANUAL-* brokerExecId (so manual closes of broker
  // trades don't overwrite the origin tag).
  if (tradeIds.size > 0) {
    const { data: orderRows } = await admin
      .from('Order')
      .select('tradeId, brokerExecId')
      .in('tradeId', Array.from(tradeIds))
      .order('executedAt', { ascending: true })

    const earliestByTradeId = new Map<string, string | null>()
    for (const row of orderRows ?? []) {
      if (!row.tradeId) continue
      if (!earliestByTradeId.has(row.tradeId)) {
        earliestByTradeId.set(row.tradeId, row.brokerExecId ?? null)
      }
    }
    const manualTradeIds = Array.from(earliestByTradeId.entries())
      .filter(([, execId]) => execId?.startsWith('MANUAL-'))
      .map(([tradeId]) => tradeId)

    if (manualTradeIds.length > 0) {
      await admin
        .from('Trade')
        .update({ source: 'manual' })
        .in('id', manualTradeIds)
        .eq('userId', user.id)
    }
  }

  // If a leg's stopPrice annotation was applied after its trade already closed
  // in this same submission (e.g. open + close legs together), the CLOSE action
  // computed actualR = null. Recompute now that the stop is persisted.
  await Promise.allSettled(
    Array.from(tradeIds).map(tradeId => recomputeActualR(admin, tradeId, user.id))
  )

  const processed = results.filter(r => r.status === 'PROCESSED').length
  const skipped   = results.filter(r => r.status === 'SKIPPED_DUPLICATE').length
  const failed    = results.filter(r => r.status === 'FAILED').length
  const errMsgs   = results.filter(r => r.status === 'FAILED').map(r => `${r.brokerExecId}: ${r.error}`)

  return NextResponse.json({ processed, skipped, failed, errors: errMsgs })
}
