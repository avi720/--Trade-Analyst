/**
 * P1 — chat AI context builder (server-only).
 *
 * Before this module the chat route had two very different context paths:
 * `full` mode ran an unbounded `JSON.stringify(all closed trades)` into the
 * system prompt on every turn (~400-600 KB for a power user), and `smart` mode
 * shipped whatever array the client happened to broadcast — which is the same
 * unbounded shape whenever no dashboard filter is active.
 *
 * Both modes now go through here. The server owns the data, the projection
 * decides which fields each mode is allowed to see, and a byte budget decides
 * whether the rows go inline at all.
 *
 * Field gates (locked spec, see docs/in-progress/PERFORMANCE-AUDIT.md — P1):
 * - Smart sees 7 fields. `openedAt` is deliberately withheld so hold-time-vs-R
 *   and day/hour-by-entry-time analysis stays a Pro capability. That gate only
 *   became real once P12 moved the day/hour charts onto `openedAt`.
 * - Full adds `openedAt`, `executionQuality`, `emotionalState`.
 * - The free-text fields (`notes`, `didRight`, `wouldChange`) are never inline
 *   in either mode — one trade can carry ~12,000 chars across the three. They
 *   are reachable only through the `queryTrades` tool (P1-C).
 */

import type { ClosedTrade } from '@/types/trade'
import type { TradeStats } from '@/lib/utils/calculations'

/**
 * Byte ceiling on the serialized trade array. ~17K tokens.
 * Starting estimate from the P1 characterization — retune against the soak
 * test rather than by feel.
 */
export const CONTEXT_BUDGET_BYTES = 60 * 1024

export type ChatContextMode = 'smart' | 'full'

/**
 * Trade shape the context is built from: `ClosedTrade` plus the one Full-only
 * annotation column. One query shape serves both modes — the *projection*,
 * not the SELECT, is where the per-mode field gate lives.
 */
export interface ChatTrade extends ClosedTrade {
  emotionalState: string | null
}

/**
 * Columns the chat route selects. Kept in lockstep with `ChatTrade`.
 * Must stay a single string literal — supabase-js infers the row type from the
 * literal, and any concatenation degrades it to `GenericStringError`.
 */
export const CHAT_TRADE_COLUMNS = 'id, ticker, direction, setupType, openedAt, closedAt, actualR, realizedPnl, result, executionQuality, emotionalState, avgEntryPrice, avgExitPrice, stopPrice, totalQuantityOpened'

export interface ChatContextResult {
  /** The rendered block that gets substituted into the system prompt. */
  contextString: string
  /** Closed trades in scope after the filter is applied. */
  totalCount: number
  /** How many of those actually made it inline. */
  includedCount: number
  /** True when the full projected set exceeded the budget. */
  overThreshold: boolean
  /** Byte size of the full projected set — what `overThreshold` is measured on. */
  totalBytes: number
}

const encoder = new TextEncoder()
function byteLen(s: string): number {
  return encoder.encode(s).length
}

function projectSmart(t: ChatTrade) {
  return {
    ticker: t.ticker,
    direction: t.direction,
    setup: t.setupType,
    actualR: t.actualR,
    realizedPnl: t.realizedPnl,
    result: t.result,
    closedAt: t.closedAt.toISOString(),
  }
}

function projectFull(t: ChatTrade) {
  return {
    ...projectSmart(t),
    openedAt: t.openedAt.toISOString(),
    executionQuality: t.executionQuality,
    emotionalState: t.emotionalState,
  }
}

export function projectTrade(t: ChatTrade, mode: ChatContextMode) {
  return mode === 'full' ? projectFull(t) : projectSmart(t)
}

// Long floats bloat the payload for no analytical gain — the model is reading
// these to spot patterns, not to reconcile a ledger.
function roundStats(stats: TradeStats): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(stats)) {
    out[k] = typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10000) / 10000 : v
  }
  return out
}

/**
 * Renders the context block for one chat turn.
 *
 * When the projected rows fit the budget they all go inline. When they don't,
 * the most recently closed ones are taken until the budget is spent and the
 * block states the shortfall explicitly, so the model reports the scope it
 * actually reasoned over instead of implying it saw everything.
 */
export function buildChatContext(params: {
  trades: ChatTrade[]
  mode: ChatContextMode
  stats: TradeStats
  filterActive: boolean
  budgetBytes?: number
  /**
   * Drop the rows entirely and keep only the KPI baseline. Set once the tool
   * layer is driving the turn (P1-C): the model pulls the slices it needs via
   * `queryTrades`, so a truncated inline window would just be a second, worse
   * source of the same data competing for the same context window.
   */
  omitRows?: boolean
}): ChatContextResult {
  const { trades, mode, stats, filterActive, omitRows = false } = params
  const budget = params.budgetBytes ?? CONTEXT_BUDGET_BYTES

  // Most recent first, so a truncated window is the useful window.
  const sorted = [...trades].sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime())
  const serialized = sorted.map(t => JSON.stringify(projectTrade(t, mode)))

  // 2 = the enclosing brackets; +1 per row after the first = the comma.
  let totalBytes = 2
  for (let i = 0; i < serialized.length; i++) {
    totalBytes += byteLen(serialized[i]) + (i > 0 ? 1 : 0)
  }
  const overThreshold = totalBytes > budget

  let included: string[] = serialized
  if (omitRows) {
    included = []
  } else if (overThreshold) {
    included = []
    let used = 2
    for (const row of serialized) {
      const cost = byteLen(row) + (included.length > 0 ? 1 : 0)
      if (used + cost > budget) break
      used += cost
      included.push(row)
    }
  }

  const scopeLine = filterActive
    ? 'ההיקף מסונן לפי המסננים הפעילים בלוח התחקור.'
    : 'ההיקף הוא כל היסטוריית הטריידים הסגורים.'

  const modeLabel = mode === 'full' ? 'עומק (Pro)' : 'חכם'

  const rowsBlock = omitRows
    ? [
        '### שורות טריידים',
        'לא נשלחו שורות גולמיות — ההיקף גדול מכדי להיכנס להודעה. ' +
          'השתמש בכלים שברשותך כדי למשוך בדיוק את הפרוסות שאתה צריך, ' +
          'וציין בתשובה על איזה היקף התבססת.',
      ]
    : [
        '### שורות טריידים',
        `[${included.join(',')}]`,
      ]

  const rowsCountLine = omitRows
    ? 'שורות מלאות שנשלחו: 0 — הנתונים זמינים דרך כלים.'
    : overThreshold
      ? `שורות מלאות שנשלחו: ${included.length} מתוך ${sorted.length}.\n` +
        `שים לב: מגבלת גודל — נשלחו אליך ${included.length} הטריידים שנסגרו לאחרונה בלבד, מתוך ${sorted.length}. ` +
        'המדדים למטה מחושבים על כל ההיקף. כשאתה עונה, ציין במפורש על איזה היקף התבססת.'
      : `שורות מלאות שנשלחו: ${included.length} מתוך ${sorted.length}.`

  const contextString = [
    '### היקף',
    `מצב: ${modeLabel}`,
    `טריידים סגורים בהיקף: ${sorted.length}. ${scopeLine}`,
    rowsCountLine,
    '',
    `### מדדי מפתח (מחושבים על כל ${sorted.length} הטריידים בהיקף)`,
    JSON.stringify(roundStats(stats)),
    '',
    ...rowsBlock,
  ].join('\n')

  return {
    contextString,
    totalCount: sorted.length,
    includedCount: included.length,
    overThreshold,
    totalBytes,
  }
}
