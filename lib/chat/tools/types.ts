/**
 * P1-C — shared contract for the chat tool-use layer (server-only).
 *
 * Tools are only registered when the in-scope trade set exceeds the inline
 * byte budget (see `context-builder.ts`), which is a Pro-gated situation. The
 * route has already fetched and filter-scoped every in-scope row by then, so
 * executors work over that in-memory array rather than re-querying — no RLS
 * re-check, no extra round-trip, and they unit-test as plain functions.
 *
 * The one exception is free text. `notes` / `didRight` / `wouldChange` are
 * deliberately absent from `CHAT_TRADE_COLUMNS` — a single trade can carry
 * ~12,000 chars across the three, so pulling them for every row would defeat
 * the point. `queryTrades` therefore resolves them lazily, for the ≤150 rows
 * it is about to return, through the `fetchFreeText` callback the route
 * supplies.
 */

import type { FunctionDeclaration } from '@google/genai'
import type { ChatContextMode, ChatTrade } from '@/lib/chat/context-builder'
import type { ResearchAggregates } from '@/lib/utils/research-aggregate'

/** Free-text annotations, fetched on demand per trade id. */
export interface TradeFreeText {
  notes: string | null
  didRight: string | null
  wouldChange: string | null
}

export type FetchFreeText = (ids: string[]) => Promise<Map<string, TradeFreeText>>

export interface ToolContext {
  /** Every in-scope closed trade — already user-scoped and filter-scoped. */
  trades: ChatTrade[]
  mode: ChatContextMode
  fetchFreeText: FetchFreeText
  /**
   * Lazily-computed single-walk aggregates over `trades`. Memoized per turn so
   * three aggregation calls in one conversation walk the array once, not thrice.
   */
  aggregates: () => ResearchAggregates
}

export interface ChatTool {
  name: string
  /** Modes this tool is offered in. Smart omits the annotation-heavy ones. */
  modes: ReadonlyArray<ChatContextMode>
  declaration: FunctionDeclaration
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> | unknown
}

/**
 * Hard ceiling on rows returned by a single `queryTrades` call.
 *
 * Deliberately generous rather than tight: the model needs room to answer
 * "compare my oldest against my newest" honestly. It is a *cap*, not the
 * default — the default is `QUERY_TRADES_DEFAULT_LIMIT`, and anything beyond
 * the cap is served by paginating with `offset` across calls, never by
 * silently truncating. Removing the cap would reintroduce the unbounded dump
 * this whole finding exists to kill.
 */
export const QUERY_TRADES_MAX_LIMIT = 150
export const QUERY_TRADES_DEFAULT_LIMIT = 20

/** Custom "אחר - <free text>" values collapse to one bucket when aggregating. */
export const OTHER_BUCKET = 'אחר'

export function collapseOther(value: string | null): string {
  if (!value) return 'לא צוין'
  return value.startsWith(`${OTHER_BUCKET} -`) || value.startsWith(`${OTHER_BUCKET} –`)
    ? OTHER_BUCKET
    : value
}

/** Filters a tool list down to the ones a given mode is allowed to see. */
export function toolsForMode(tools: ChatTool[], mode: ChatContextMode): ChatTool[] {
  return tools.filter(t => t.modes.includes(mode))
}
