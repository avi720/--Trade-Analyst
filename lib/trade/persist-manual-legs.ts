/**
 * Server-only persistence for manual / AI-imported trade legs.
 *
 * Holds the shared pipeline that used to live inline in
 * app/api/trades/manual/route.ts: FIFO processing → Trade-level annotation
 * merge → manual-source tagging → actualR recompute. Both the manual-entry
 * route and the AI-Excel-import confirm route call this so the two paths never
 * drift apart.
 *
 * NEVER import this from a client component — it pulls in the service-role
 * admin client. Keep lib/trade/manual-entry.ts (which IS client-imported) free
 * of these dependencies.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildExecutions,
  extractAnnotations,
  manualBrokerExecId,
  type ManualLeg,
  type ManualEntryError,
} from '@/lib/trade/manual-entry'
import type { TablesUpdate } from '@/lib/db/types'
import { processExecutions } from '@/lib/ibkr/process-executions'
import { recomputeActualR } from '@/lib/trade/recompute-actual-r'

export interface ImportSummary {
  processed: number
  skipped: number
  failed: number
  errors: string[]
  /** Legs dropped by business-rule validation (validateLeg) before FIFO. */
  validationErrors: ManualEntryError[]
}

/**
 * Runs the full manual-import pipeline for a batch of legs and returns a
 * summary. Invalid legs (per validateLeg) are dropped and reported in
 * validationErrors — the valid subset is still processed (partial-import
 * semantics, matching the Excel import route).
 */
export async function persistManualLegs(
  legs: ManualLeg[],
  userId: string,
): Promise<ImportSummary> {
  const { executions, errors: validationErrors } = buildExecutions(legs)

  const results = await processExecutions(executions, userId)

  const admin = createAdminClient()
  const resultByExecId = new Map(results.map((r) => [r.brokerExecId, r]))
  const tradeIds = new Set<string>()
  const annotationsByTradeId = new Map<string, TablesUpdate<'Trade'>>()

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    const execId = manualBrokerExecId(leg, i)
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
      admin.from('Trade').update(annotations).eq('id', tradeId).eq('userId', userId),
    ),
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
        .eq('userId', userId)
    }
  }

  // If a leg's stopPrice annotation was applied after its trade already closed
  // in this same submission, the CLOSE action computed actualR = null.
  // Recompute now that the stop is persisted.
  await Promise.allSettled(
    Array.from(tradeIds).map((tradeId) => recomputeActualR(admin, tradeId, userId)),
  )

  const processed = results.filter((r) => r.status === 'PROCESSED').length
  const skipped = results.filter((r) => r.status === 'SKIPPED_DUPLICATE').length
  const failed = results.filter((r) => r.status === 'FAILED').length
  const errors = results
    .filter((r) => r.status === 'FAILED')
    .map((r) => `${r.brokerExecId}: ${r.error}`)

  return { processed, skipped, failed, errors, validationErrors }
}
