/**
 * Recompute a closed Trade's actualR (and result) after its stopPrice has been
 * persisted.
 *
 * Why this exists: the manual-entry flows persist the stopPrice as a Trade-level
 * annotation *after* the FIFO close has already run. At close time the trade's
 * stopPrice was still null, so the CLOSE action computed actualR = null. Once the
 * stop is written we can derive the R-multiple, which feeds the research-tab
 * R metrics (avg R, expectancy, equity curve, R distribution).
 *
 * Idempotent: when actualR was already computed by FIFO (open + close in separate
 * submissions), recomputing yields the same value.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { calcActualR, resultFromR } from './fifo'
import type { Database } from '@/lib/db/types'

/**
 * Reads the trade, and if it is Closed with a stopPrice set, recomputes and
 * persists actualR + result. No-op for open trades or trades without a stop.
 */
export async function recomputeActualR(
  admin: SupabaseClient<Database>,
  tradeId: string,
  userId: string,
): Promise<void> {
  const { data: t } = await admin
    .from('Trade')
    .select('status, realizedPnl, avgEntryPrice, stopPrice, totalQuantityOpened')
    .eq('id', tradeId)
    .eq('userId', userId)
    .maybeSingle()

  if (!t || t.status !== 'Closed' || t.stopPrice == null) return

  const realizedPnl = t.realizedPnl ?? 0
  const actualR = calcActualR(realizedPnl, t.avgEntryPrice, t.stopPrice, t.totalQuantityOpened)
  if (actualR == null) return

  const result = resultFromR(actualR, realizedPnl)

  await admin
    .from('Trade')
    .update({ actualR, result })
    .eq('id', tradeId)
    .eq('userId', userId)
}
