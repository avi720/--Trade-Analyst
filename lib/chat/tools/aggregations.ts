/**
 * P1-C — aggregation tools for the chat assistant (server-only).
 *
 * These exist for *precision*, not access. The model can already see raw rows
 * (inline, or via `queryTrades`), so nothing here unlocks new data — but a win
 * rate or an average-R eyeballed off 300 rows by an LLM is a guess. Every
 * number the assistant quotes about a group of trades should be arithmetic the
 * server did, and should equal what the research dashboard shows the user.
 *
 * That last part is why the first three tools read `ctx.aggregates()` rather
 * than re-deriving anything: `computeResearchAggregates` is the same function
 * the dashboard renders from, and its golden test pins it to the reference
 * helpers in `calculations.ts` / `research-charts.ts`.
 *
 * Conventions shared by all six:
 * - `winRate` is a 0-1 fraction (matching `calcStats`), never a percentage.
 * - `avgR` is computed over trades with a non-null `actualR` only, and is
 *   `null` — never 0, never NaN — when a group has none. A stopless trade has
 *   no R-multiple; reporting 0 would read as "breakeven".
 * - Every float is rounded to 4 decimals. Long mantissas cost tokens and buy
 *   the model nothing.
 */

import { Type } from '@google/genai'
import type { ChatTool, ToolContext } from './types'
import { collapseOther } from './types'
import type { ChatTrade } from '@/lib/chat/context-builder'

function round4(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : n
}

/** Empty-object schema for the five tools that take no arguments. */
const NO_PARAMS = { type: Type.OBJECT, properties: {} } as const

/** Accumulator shared by the ad-hoc groupers (execution quality, emotion). */
interface Bucket {
  tradeCount: number
  wins: number
  rSum: number
  rCount: number
  totalPnl: number
}

function newBucket(): Bucket {
  return { tradeCount: 0, wins: 0, rSum: 0, rCount: 0, totalPnl: 0 }
}

// Win/loss classification follows `calcStats`: $-based, so trades without a
// stop still count. `pnlByTicker` is the one place that keys off `result`
// instead, and that tool reuses its numbers rather than recomputing them.
function addToBucket(b: Bucket, t: ChatTrade): void {
  b.tradeCount++
  if (t.realizedPnl > 0) b.wins++
  if (t.realizedPnl != null) b.totalPnl += t.realizedPnl
  if (t.actualR != null) {
    b.rSum += t.actualR
    b.rCount++
  }
}

function bucketWinRate(b: Bucket): number {
  return b.tradeCount > 0 ? round4(b.wins / b.tradeCount) : 0
}

function bucketAvgR(b: Bucket): number | null {
  return b.rCount > 0 ? round4(b.rSum / b.rCount) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Setup breakdown
// ─────────────────────────────────────────────────────────────────────────────

export const getSetupBreakdown: ChatTool = {
  name: 'getSetupBreakdown',
  modes: ['smart', 'full'],
  declaration: {
    name: 'getSetupBreakdown',
    description:
      'Server-computed performance per setup type (setupType) over every in-scope closed trade. ' +
      'Returns one row per setup with tradeCount, winRate (0-1 fraction) and avgR. ' +
      'Custom setups the user typed as "אחר - <text>" are merged into a single "אחר" bucket. ' +
      'Trades with no setup tagged appear as "untagged". ' +
      'avgR is null when no trade in that setup had a stop price, so no R-multiple exists. ' +
      'Use this instead of counting rows yourself whenever the question is about which setup performs best.',
    parameters: NO_PARAMS,
  },
  execute(_args: Record<string, unknown>, ctx: ToolContext) {
    const agg = ctx.aggregates()

    // `SetupStat` carries avgR but not the count it was averaged over, and a
    // weighted merge of the "אחר - …" rows needs that weight. It is also the
    // only way to tell "avgR 0 because the R trades averaged out" from "avgR 0
    // because there were no R trades". One pass over the raw rows recovers it;
    // every other number still comes from the dashboard's own aggregate.
    const rCountByKey = new Map<string, number>()
    for (const t of ctx.trades) {
      if (t.actualR == null) continue
      const key = t.setupType ?? 'untagged'
      rCountByKey.set(key, (rCountByKey.get(key) ?? 0) + 1)
    }

    const merged = new Map<string, Bucket>()
    for (const row of agg.setup) {
      const key = collapseOther(row.setupType)
      let b = merged.get(key)
      if (!b) {
        b = newBucket()
        merged.set(key, b)
      }
      const rCount = rCountByKey.get(row.setupType) ?? 0
      b.tradeCount += row.count
      // winRate is wins/count by construction, so this recovers the integer.
      b.wins += Math.round(row.winRate * row.count)
      b.rCount += rCount
      b.rSum += row.avgR * rCount
    }

    const setups = Array.from(merged, ([setupType, b]) => ({
      setupType,
      tradeCount: b.tradeCount,
      winRate: bucketWinRate(b),
      avgR: bucketAvgR(b),
    }))

    return { setups, totalTrades: ctx.trades.length }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Ticker breakdown
// ─────────────────────────────────────────────────────────────────────────────

const TICKER_DEFAULT_LIMIT = 20
const TICKER_MAX_LIMIT = 100

export const getTickerBreakdown: ChatTool = {
  name: 'getTickerBreakdown',
  modes: ['smart', 'full'],
  declaration: {
    name: 'getTickerBreakdown',
    description:
      'Server-computed P&L per ticker over every in-scope closed trade: totalPnl, tradeCount and winRate (0-1 fraction). ' +
      'Returns the top N tickers only, plus hasMore so you can tell the user the list is partial. ' +
      'Sort with orderBy=totalPnl (default, best-to-worst money) or orderBy=tradeCount (most-traded first). ' +
      'winRate here counts trades whose result field is "Win", matching the research dashboard chart.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.INTEGER,
          description: `How many tickers to return. Default ${TICKER_DEFAULT_LIMIT}, clamped to [1, ${TICKER_MAX_LIMIT}].`,
        },
        orderBy: {
          type: Type.STRING,
          enum: ['totalPnl', 'tradeCount'],
          description: 'Sort key, descending. Defaults to totalPnl.',
        },
      },
    },
  },
  execute(args: Record<string, unknown>, ctx: ToolContext) {
    const rawLimit = typeof args.limit === 'number' ? Math.trunc(args.limit) : TICKER_DEFAULT_LIMIT
    const limit = Number.isFinite(rawLimit)
      ? Math.min(TICKER_MAX_LIMIT, Math.max(1, rawLimit))
      : TICKER_DEFAULT_LIMIT
    const orderBy = args.orderBy === 'tradeCount' ? 'tradeCount' : 'totalPnl'

    // Already sorted by totalPnl desc inside the aggregate; only the alternate
    // ordering needs a copy-and-sort.
    const all = ctx.aggregates().ticker
    const ordered = orderBy === 'tradeCount'
      ? [...all].sort((a, b) => b.tradeCount - a.tradeCount)
      : all

    const tickers = ordered.slice(0, limit).map(r => ({
      ticker: r.ticker,
      totalPnl: round4(r.totalPnl),
      tradeCount: r.tradeCount,
      winRate: round4(r.winRate),
    }))

    return {
      tickers,
      returned: tickers.length,
      totalTickers: all.length,
      hasMore: all.length > tickers.length,
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Day-of-week / hour breakdown
// ─────────────────────────────────────────────────────────────────────────────

export const getDayHourBreakdown: ChatTool = {
  name: 'getDayHourBreakdown',
  modes: ['smart', 'full'],
  declaration: {
    name: 'getDayHourBreakdown',
    description:
      'Server-computed P&L by day of week and by hour of day. ' +
      'IMPORTANT: both are bucketed by the trade ENTRY time (when the position was opened), not by the exit time. ' +
      'Say so when you report these — "the days you enter trades", not "the days you close them". ' +
      'byDayOfWeek always returns all seven days in Hebrew, Sunday first, including days with zero trades. ' +
      'byHour returns only hours (0-23) that actually have trades.',
    parameters: NO_PARAMS,
  },
  execute(_args: Record<string, unknown>, ctx: ToolContext) {
    const agg = ctx.aggregates()
    return {
      byDayOfWeek: agg.dayofweek.map(d => ({
        day: d.day,
        totalPnl: round4(d.totalPnl),
        tradeCount: d.tradeCount,
      })),
      byHour: agg.hour.map(h => ({
        hour: h.hour,
        totalPnl: round4(h.totalPnl),
        tradeCount: h.tradeCount,
      })),
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Execution quality breakdown (full mode only)
// ─────────────────────────────────────────────────────────────────────────────

export const getExecutionQualityBreakdown: ChatTool = {
  name: 'getExecutionQualityBreakdown',
  modes: ['full'],
  declaration: {
    name: 'getExecutionQualityBreakdown',
    description:
      'Server-computed performance grouped by the self-rated execution quality score (1-10), ascending. ' +
      'Per score: tradeCount, winRate (0-1 fraction), avgR and totalPnl. ' +
      'Also returns scored/unscored counts — execution quality is optional and most users leave most trades unrated, ' +
      'so always check how large the scored sample is before drawing a conclusion from it.',
    parameters: NO_PARAMS,
  },
  execute(_args: Record<string, unknown>, ctx: ToolContext) {
    const byScore = new Map<number, Bucket>()
    let unscored = 0

    for (const t of ctx.trades) {
      if (t.executionQuality == null) {
        unscored++
        continue
      }
      const score = Math.trunc(t.executionQuality)
      let b = byScore.get(score)
      if (!b) {
        b = newBucket()
        byScore.set(score, b)
      }
      addToBucket(b, t)
    }

    const scores = Array.from(byScore, ([score, b]) => ({
      score,
      tradeCount: b.tradeCount,
      winRate: bucketWinRate(b),
      avgR: bucketAvgR(b),
      totalPnl: round4(b.totalPnl),
    })).sort((a, b) => a.score - b.score)

    return { scores, scored: ctx.trades.length - unscored, unscored }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Emotional state breakdown (full mode only)
// ─────────────────────────────────────────────────────────────────────────────

export const getEmotionalStateBreakdown: ChatTool = {
  name: 'getEmotionalStateBreakdown',
  modes: ['full'],
  declaration: {
    name: 'getEmotionalStateBreakdown',
    description:
      'Server-computed performance grouped by the emotional state the user logged on the trade, most-traded state first. ' +
      'Per state: tradeCount, winRate (0-1 fraction), avgR and totalPnl. ' +
      'Custom states typed as "אחר - <text>" are merged into a single "אחר" bucket; trades with no state logged ' +
      'appear as "לא צוין" and are also reported separately as unspecified.',
    parameters: NO_PARAMS,
  },
  execute(_args: Record<string, unknown>, ctx: ToolContext) {
    const byState = new Map<string, Bucket>()
    let unspecified = 0

    for (const t of ctx.trades) {
      if (t.emotionalState == null) unspecified++
      // Nulls still get a bucket (collapseOther maps them to "לא צוין") so the
      // rows sum to the full trade count — the unspecified figure is a
      // convenience, not a subset that went missing.
      const key = collapseOther(t.emotionalState)
      let b = byState.get(key)
      if (!b) {
        b = newBucket()
        byState.set(key, b)
      }
      addToBucket(b, t)
    }

    const states = Array.from(byState, ([state, b]) => ({
      state,
      tradeCount: b.tradeCount,
      winRate: bucketWinRate(b),
      avgR: bucketAvgR(b),
      totalPnl: round4(b.totalPnl),
    })).sort((a, b) => b.tradeCount - a.tradeCount)

    return { states, unspecified }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Hold time vs R (full mode only)
// ─────────────────────────────────────────────────────────────────────────────

/** Left-inclusive `[min, max)` hours, same convention as the R bins. */
const HOLD_BUCKETS: Array<{ bucket: string; min: number; max: number }> = [
  { bucket: '<1h',   min: 0,   max: 1 },
  { bucket: '1-4h',  min: 1,   max: 4 },
  { bucket: '4-24h', min: 4,   max: 24 },
  { bucket: '1-3d',  min: 24,  max: 72 },
  { bucket: '3-7d',  min: 72,  max: 168 },
  { bucket: '>7d',   min: 168, max: Infinity },
]

function holdBucketIndex(hours: number): number {
  for (let i = 0; i < HOLD_BUCKETS.length; i++) {
    if (hours >= HOLD_BUCKETS[i].min && hours < HOLD_BUCKETS[i].max) return i
  }
  return -1
}

export const getHoldTimeVsRSummary: ChatTool = {
  name: 'getHoldTimeVsRSummary',
  modes: ['full'],
  declaration: {
    name: 'getHoldTimeVsRSummary',
    description:
      'Server-computed performance grouped by how long the position was held: <1h, 1-4h, 4-24h, 1-3d, 3-7d, >7d. ' +
      'Per bucket: tradeCount, winRate (0-1 fraction), avgR and totalPnl. All six buckets are always returned, ' +
      'including empty ones. ' +
      'The sample is limited to trades that have an R-multiple (a stop price was set) — tradesWithoutR tells you ' +
      'how many in-scope trades were left out, so say so if that number is large.',
    parameters: NO_PARAMS,
  },
  execute(_args: Record<string, unknown>, ctx: ToolContext) {
    const agg = ctx.aggregates()
    const buckets = HOLD_BUCKETS.map(() => newBucket())

    // The dashboard's hold-time points carry holdHours / actualR / result but
    // no P&L (see `HoldTimePoint`), so counts, win rate and avgR come from the
    // points while totalPnl is summed over the same subset of `ctx.trades`.
    // Both walks agree on membership: `actualR != null`, hold clamped at 0.
    for (const p of [...agg.holdWins, ...agg.holdLoss, ...agg.holdOther]) {
      const idx = holdBucketIndex(p.holdHours)
      if (idx === -1) continue
      const b = buckets[idx]
      b.tradeCount++
      if (p.result === 'Win') b.wins++
      b.rSum += p.actualR
      b.rCount++
    }

    let tradesWithoutR = 0
    for (const t of ctx.trades) {
      if (t.actualR == null) {
        tradesWithoutR++
        continue
      }
      const hours = Math.max(0, (t.closedAt.getTime() - t.openedAt.getTime()) / 3_600_000)
      const idx = holdBucketIndex(hours)
      if (idx !== -1 && t.realizedPnl != null) buckets[idx].totalPnl += t.realizedPnl
    }

    return {
      buckets: HOLD_BUCKETS.map((def, i) => ({
        bucket: def.bucket,
        tradeCount: buckets[i].tradeCount,
        winRate: bucketWinRate(buckets[i]),
        avgR: bucketAvgR(buckets[i]),
        totalPnl: round4(buckets[i].totalPnl),
      })),
      tradesWithR: ctx.trades.length - tradesWithoutR,
      tradesWithoutR,
    }
  },
}

export const aggregationTools: ChatTool[] = [
  getSetupBreakdown,
  getTickerBreakdown,
  getDayHourBreakdown,
  getExecutionQualityBreakdown,
  getEmotionalStateBreakdown,
  getHoldTimeVsRSummary,
]
