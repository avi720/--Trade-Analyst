/**
 * "Opening only" guard for the manual trade-entry path.
 *
 * The manual-entry tab (טרייד פתוח) exists to OPEN a position. Everything that
 * mutates a position that already exists — adding to it, trimming it, closing
 * it, flipping it — belongs to the dedicated modals in the search tab, which
 * capture the extra context those actions need (close reason, execution
 * quality, the "why" note). Without this guard a user could close a trade
 * simply by entering an opposite-side execution, bypassing all of that.
 *
 * Two things are rejected:
 *   1. ANY leg that acts on a trade that was already open before this
 *      submission — including a plain scale-in.
 *   2. Any leg that reduces / closes / reverses a position opened earlier in
 *      the same submission (a batch that closes itself).
 *
 * Multi-leg entry still works: the first leg OPENs and the rest SCALE_IN onto
 * it, which is how partial fills of a single entry are recorded.
 *
 * This module is deliberately pure + client-safe (type-only Supabase imports)
 * so the entry form can run the exact same simulation before submitting.
 * It reuses `matchExecution` rather than re-deriving FIFO semantics — if the
 * FIFO rules change, the guard follows automatically.
 *
 * Scope: the manual-entry route ONLY. The Excel / AI imports legitimately carry
 * closing rows (a broker execution log has a SELL row for every BUY), IBKR sync
 * obviously does, and the dedicated close / add / reduce routes are the very
 * paths this guard steers users toward. None of them go through here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { matchExecution } from '@/lib/trade/fifo'
import type { Database } from '@/lib/db/types'
import type { FifoAction, NormalizedExecution, OpenTradeSnapshot, TradeCreate } from '@/types/trade'

export type ForbiddenReason =
  /** The leg touches a position that existed before this submission. */
  | 'EXISTING_POSITION'
  /** The leg reduces/closes/reverses a position opened earlier in this batch. */
  | 'CLOSES_WITHIN_BATCH'

export interface ForbiddenLeg {
  /** Index into the executions array handed to findForbiddenLegs. */
  index: number
  ticker: string
  action: FifoAction['type']
  reason: ForbiddenReason
}

/** Snapshots of the user's currently-open trades, keyed by ticker. */
export type OpenSnapshotsByTicker = Map<string, OpenTradeSnapshot>

/** Columns needed to build an OpenTradeSnapshot. Shared with /api/trades/open-positions. */
export const OPEN_TRADE_COLUMNS =
  'id, ticker, direction, avgEntryPrice, totalQuantity, totalQuantityOpened, totalCommission, realizedPnl, openedAt, stopPrice'

/** Row shape returned by the open-trade query — also what /api/trades/open serves. */
export interface OpenTradeRow {
  id: string
  ticker: string
  direction: string
  avgEntryPrice: number
  totalQuantity: number
  totalQuantityOpened: number
  totalCommission: number | null
  realizedPnl: number | null
  openedAt: string
  stopPrice: number | null
}

export function snapshotFromRow(row: OpenTradeRow): OpenTradeSnapshot {
  return {
    id: row.id,
    direction: row.direction as 'Long' | 'Short',
    avgEntryPrice: row.avgEntryPrice,
    totalQuantity: row.totalQuantity,
    totalQuantityOpened: row.totalQuantityOpened,
    totalCommission: row.totalCommission ?? 0,
    realizedPnl: row.realizedPnl ?? 0,
    openedAt: new Date(row.openedAt),
    stopPrice: row.stopPrice ?? null,
  }
}

export function snapshotsByTicker(rows: OpenTradeRow[]): OpenSnapshotsByTicker {
  const map: OpenSnapshotsByTicker = new Map()
  for (const row of rows) {
    map.set(row.ticker.trim().toUpperCase(), snapshotFromRow(row))
  }
  return map
}

/**
 * Loads the open trades for the given tickers. Accepts the Supabase client as a
 * parameter (rather than importing one) so this file stays client-safe.
 */
export async function loadOpenSnapshots(
  client: SupabaseClient<Database>,
  userId: string,
  tickers: string[],
): Promise<OpenSnapshotsByTicker> {
  const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()))).filter(Boolean)
  if (unique.length === 0) return new Map()

  const { data, error } = await client
    .from('Trade')
    .select(OPEN_TRADE_COLUMNS)
    .eq('userId', userId)
    .eq('status', 'Open')
    .in('ticker', unique)

  if (error) throw new Error(`Failed to load open positions: ${error.message}`)
  return snapshotsByTicker((data ?? []) as OpenTradeRow[])
}

/**
 * Applies a FifoAction to an in-memory snapshot so the next leg of the same
 * ticker is matched against the updated state. Mirrors what the DB writes do.
 */
function applyAction(
  snapshot: OpenTradeSnapshot | null,
  action: FifoAction,
): OpenTradeSnapshot | null {
  switch (action.type) {
    case 'OPEN':
      return fromTradeCreate(action.tradeCreate)
    case 'CLOSE':
      return null
    case 'REVERSAL':
      return fromTradeCreate(action.open.tradeCreate)
    case 'SCALE_IN':
    case 'REDUCE': {
      if (!snapshot) return snapshot
      const u = action.tradeUpdate
      return {
        ...snapshot,
        avgEntryPrice: u.avgEntryPrice ?? snapshot.avgEntryPrice,
        totalQuantity: u.totalQuantity ?? snapshot.totalQuantity,
        totalQuantityOpened: u.totalQuantityOpened ?? snapshot.totalQuantityOpened,
        totalCommission: u.totalCommission ?? snapshot.totalCommission,
        realizedPnl: u.realizedPnl ?? snapshot.realizedPnl,
      }
    }
  }
}

function fromTradeCreate(t: TradeCreate): OpenTradeSnapshot {
  return {
    // Synthetic id — nothing in the simulation dereferences it.
    id: '',
    direction: t.direction,
    avgEntryPrice: t.avgEntryPrice,
    totalQuantity: t.totalQuantity,
    totalQuantityOpened: t.totalQuantityOpened,
    totalCommission: t.totalCommission,
    realizedPnl: t.realizedPnl,
    openedAt: t.openedAt,
    stopPrice: t.stopPrice,
  }
}

/**
 * Replays the batch through FIFO and reports every leg that isn't a pure open.
 *
 * Executions are grouped by ticker and replayed in input order — the exact
 * order processExecutions persists them in — so the simulation and the real
 * write path can never disagree about which action a leg produces.
 */
export function findForbiddenLegs(
  executions: NormalizedExecution[],
  openByTicker: OpenSnapshotsByTicker,
): ForbiddenLeg[] {
  const byTicker = new Map<string, Array<{ exec: NormalizedExecution; index: number }>>()
  for (let i = 0; i < executions.length; i++) {
    const exec = executions[i]
    const key = exec.ticker.trim().toUpperCase()
    const bucket = byTicker.get(key)
    if (bucket) bucket.push({ exec, index: i })
    else byTicker.set(key, [{ exec, index: i }])
  }

  const forbidden: ForbiddenLeg[] = []

  for (const [ticker, bucket] of byTicker) {
    let snapshot = openByTicker.get(ticker) ?? null
    // True while `snapshot` is the row that already existed in the DB. Flips to
    // false the moment this batch opens a position of its own.
    let preExisting = snapshot !== null

    for (const { exec, index } of bucket) {
      const action = matchExecution(exec, snapshot)

      if (preExisting) {
        forbidden.push({ index, ticker, action: action.type, reason: 'EXISTING_POSITION' })
      } else if (action.type !== 'OPEN' && action.type !== 'SCALE_IN') {
        forbidden.push({ index, ticker, action: action.type, reason: 'CLOSES_WITHIN_BATCH' })
      }

      snapshot = applyAction(snapshot, action)
      // Once the pre-existing trade is closed or flipped, whatever remains was
      // created by this batch.
      if (action.type === 'CLOSE' || action.type === 'REVERSAL' || snapshot === null) {
        preExisting = false
      }
    }
  }

  return forbidden.sort((a, b) => a.index - b.index)
}

/** Hebrew, user-facing explanation for a rejected leg. */
export function forbiddenLegMessage(leg: ForbiddenLeg): string {
  const card = `כרטיס ${leg.index + 1} (${leg.ticker})`
  if (leg.reason === 'EXISTING_POSITION') {
    return leg.action === 'SCALE_IN'
      ? `${card}: כבר קיימת פוזיציה פתוחה בטיקר הזה. להוספת כסף לפוזיציה קיימת השתמש בטאב "חיפוש" ← "הוספה לפוזיציה".`
      : `${card}: כבר קיימת פוזיציה פתוחה בטיקר הזה, וההזנה הזו סוגרת או מקטינה אותה. סגירה ומכירה חלקית מתבצעות בטאב "חיפוש" בלבד.`
  }
  return `${card}: ההגשה הזו סוגרת את הפוזיציה שנפתחה בה. טאב זה מיועד לפתיחת טרייד בלבד — לסגירה השתמש בטאב "חיפוש".`
}
