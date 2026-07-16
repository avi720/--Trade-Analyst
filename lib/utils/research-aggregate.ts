/**
 * P9 — single-walk research aggregator.
 *
 * The research dashboard used to run ~18 passes over `filteredTrades` per
 * recompute: `calcStats` alone did ~9 (winners/losers filter, drawdown sort,
 * R subset, ...) and each of the 8 chart helpers did another. This module
 * walks the array once and materializes every downstream shape.
 *
 * The individual helpers in `calculations.ts` + `research-charts.ts` are kept
 * untouched — they remain the reference implementation and the golden test
 * in `__tests__/research-aggregate.test.ts` proves this file's output equals
 * calling them one-by-one. That way the user-visible numbers cannot drift.
 */

import type { ClosedTrade } from '@/types/trade'
import type { TradeStats, EquityPoint, RBin, SetupStat } from './calculations'
import type { TickerStat, HoldTimePoint, DayStat, HourStat } from './research-charts'

// Kept in lockstep with calculations.ts R_BINS.
// Left-inclusive [min, max) — same semantics as the reference impl.
const R_BINS: Array<{ label: string; min: number; max: number }> = [
  { label: '<-2R',     min: -Infinity, max: -2 },
  { label: '-2R–-1R',  min: -2,        max: -1 },
  { label: '-1R–0R',   min: -1,        max: 0  },
  { label: '0R–1R',    min: 0,         max: 1  },
  { label: '1R–2R',    min: 1,         max: 2  },
  { label: '>2R',      min: 2,         max: Infinity },
]

// Kept in lockstep with research-charts.ts HEBREW_DAYS.
const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

// Picks the R-distribution bin index for a value. Falls back to -1 if a bin
// row is missing (unreachable given the covering range above).
function rBinIndex(r: number): number {
  for (let i = 0; i < R_BINS.length; i++) {
    const b = R_BINS[i]
    if (r >= b.min && r < b.max) return i
  }
  return -1
}

export interface ResearchAggregates {
  stats: TradeStats
  equity: EquityPoint[]
  rdist: RBin[]
  setup: SetupStat[]
  ticker: TickerStat[]
  holdWins: HoldTimePoint[]
  holdLoss: HoldTimePoint[]
  holdOther: HoldTimePoint[]
  dayofweek: DayStat[]
  hour: HourStat[]
}

interface SetupBucket {
  wins: number
  count: number
  rSum: number
  rCount: number
}
interface TickerBucket {
  totalPnl: number
  tradeCount: number
  winCount: number
}
interface HourBucket {
  hour: number
  totalPnl: number
  tradeCount: number
}

// Single walk. Returns the exact same shapes as the original helpers so the
// dashboard's downstream consumers don't need to change.
export function computeResearchAggregates(trades: ClosedTrade[]): ResearchAggregates {
  // ── Empty short-circuit — mirrors calcStats' empty guard. ──────────────────
  if (trades.length === 0) {
    return {
      stats: { totalTrades: 0, rTradeCount: 0, winRate: 0, avgR: 0, profitFactor: 0, expectancy: 0, maxDrawdown: 0, totalPnl: 0, avgWin: 0, avgLoss: 0 },
      equity: [],
      rdist: R_BINS.map(b => ({ label: b.label, count: 0 })),
      setup: [],
      ticker: [],
      holdWins: [],
      holdLoss: [],
      holdOther: [],
      dayofweek: HEBREW_DAYS.map(day => ({ day, totalPnl: 0, tradeCount: 0 })),
      hour: [],
    }
  }

  // ── Scalar accumulators for calcStats. ─────────────────────────────────────
  let winnersCount = 0
  let losersCount = 0
  let grossWinUsd = 0
  let grossLossUsd = 0 // absolute value
  let totalPnl = 0
  let rSum = 0
  let rCount = 0

  // For equity curve and drawdown we need sorted-by-closedAt order.
  // Materialize the projections we need so the post-pass is O(n log n) sort +
  // O(n) walks, without another read of the source array.
  const equityRaw: Array<{ t: number; actualR: number }> = []
  const drawdownRaw: Array<{ t: number; pnl: number }> = []

  const rdistCounts: number[] = new Array(R_BINS.length).fill(0)

  const setupMap = new Map<string, SetupBucket>()
  const tickerMap = new Map<string, TickerBucket>()

  const holdWins: HoldTimePoint[] = []
  const holdLoss: HoldTimePoint[] = []
  const holdOther: HoldTimePoint[] = []

  const dayStats: DayStat[] = HEBREW_DAYS.map(day => ({ day, totalPnl: 0, tradeCount: 0 }))
  const hourMap = new Map<number, HourBucket>()

  // ── The single walk. ───────────────────────────────────────────────────────
  for (const t of trades) {
    const pnl = t.realizedPnl
    const r = t.actualR
    const closedTs = t.closedAt.getTime()

    // ── calcStats scalars ──
    // Note: reference impl filters winners/losers on realizedPnl > 0 / < 0
    // AND sums totalPnl separately over ALL trades (not just wins - losses).
    // We mirror that exactly to keep behavior identical for null/0-pnl edges.
    totalPnl += pnl
    if (pnl > 0) {
      winnersCount++
      grossWinUsd += pnl
    } else if (pnl < 0) {
      losersCount++
      grossLossUsd += -pnl // Math.abs(pnl); pnl < 0 here so -pnl > 0
    }
    if (r != null) {
      rSum += r
      rCount++
      // rDistribution walks the same subset
      const idx = rBinIndex(r)
      if (idx !== -1) rdistCounts[idx]++
    }

    // equity curve — only R trades, sort after
    if (r != null) {
      equityRaw.push({ t: closedTs, actualR: r })
    }

    // drawdown — every trade, sort after; matches calcStats' sortedByClose walk
    drawdownRaw.push({ t: closedTs, pnl })

    // setup groups — key mirrors setupPerformance's 'untagged' fallback
    const setupKey = t.setupType ?? 'untagged'
    let setupBucket = setupMap.get(setupKey)
    if (!setupBucket) {
      setupBucket = { wins: 0, count: 0, rSum: 0, rCount: 0 }
      setupMap.set(setupKey, setupBucket)
    }
    setupBucket.count++
    if (pnl > 0) setupBucket.wins++
    if (r != null) {
      setupBucket.rSum += r
      setupBucket.rCount++
    }

    // ── research-charts shapes ──

    // pnlByTicker skips null realizedPnl in the reference; realizedPnl is
    // typed as `number` on ClosedTrade but the test fixtures + runtime data
    // let null slip through (see the `null realizedPnl skipped` test). Mirror
    // the reference guard bit-for-bit.
    if (pnl != null) {
      let tickerBucket = tickerMap.get(t.ticker)
      if (!tickerBucket) {
        tickerBucket = { totalPnl: 0, tradeCount: 0, winCount: 0 }
        tickerMap.set(t.ticker, tickerBucket)
      }
      tickerBucket.totalPnl += pnl
      tickerBucket.tradeCount++
      // pnlByTicker uses t.result === 'Win' (not realizedPnl > 0)
      if (t.result === 'Win') tickerBucket.winCount++

      // pnlByDayOfWeek + pnlByHour both guard on realizedPnl != null.
      // Both use browser-local getDay()/getHours() — carried through unchanged.
      const dayIdx = t.closedAt.getDay()
      const dayStat = dayStats[dayIdx]
      dayStat.totalPnl += pnl
      dayStat.tradeCount++

      const hourNum = t.closedAt.getHours()
      const existingHour = hourMap.get(hourNum)
      if (existingHour) {
        existingHour.totalPnl += pnl
        existingHour.tradeCount++
      } else {
        hourMap.set(hourNum, { hour: hourNum, totalPnl: pnl, tradeCount: 1 })
      }
    }

    // holdTimeVsR — skip null actualR, clamp hold to >= 0. Additionally the
    // dashboard splits by result into Win / Loss / Other buckets — we do the
    // split inline here so the useMemo doesn't run 3 more filters afterwards.
    if (r != null) {
      const holdHours = Math.max(0, (closedTs - t.openedAt.getTime()) / 3_600_000)
      const point: HoldTimePoint = {
        holdHours,
        actualR: r,
        ticker: t.ticker,
        result: t.result ?? '',
      }
      if (t.result === 'Win') holdWins.push(point)
      else if (t.result === 'Loss') holdLoss.push(point)
      else holdOther.push(point)
    }
  }

  // ── Post-pass: sort + materialize maps + drawdown ──────────────────────────

  // Equity curve — sort by close ts, then accumulate. Matches equityCurve().
  equityRaw.sort((a, b) => a.t - b.t)
  const equity: EquityPoint[] = new Array(equityRaw.length)
  let cumR = 0
  for (let i = 0; i < equityRaw.length; i++) {
    cumR += equityRaw[i].actualR
    equity[i] = { date: equityRaw[i].t, cumulativeR: cumR }
  }

  // Max drawdown on $ realizedPnl, sorted by close ts. Matches calcStats.
  drawdownRaw.sort((a, b) => a.t - b.t)
  let peak = 0
  let cumPnl = 0
  let maxDrawdown = 0
  for (const p of drawdownRaw) {
    cumPnl += p.pnl
    if (cumPnl > peak) peak = cumPnl
    const dd = cumPnl - peak
    if (dd < maxDrawdown) maxDrawdown = dd
  }

  // Stats derived from scalars — mirrors calcStats final assembly.
  const winRate = winnersCount / trades.length
  const profitFactor = grossLossUsd === 0 ? 999 : grossWinUsd / grossLossUsd
  const avgWin = winnersCount > 0 ? grossWinUsd / winnersCount : 0
  const avgLoss = losersCount > 0 ? -(grossLossUsd / losersCount) : 0
  const avgR = rCount > 0 ? rSum / rCount : 0

  const stats: TradeStats = {
    totalTrades: trades.length,
    rTradeCount: rCount,
    winRate,
    avgR,
    profitFactor,
    expectancy: avgR, // reference: expectancy = avgR
    maxDrawdown,
    totalPnl,
    avgWin,
    avgLoss,
  }

  // rDistribution — bind labels back onto counts.
  const rdist: RBin[] = R_BINS.map((b, i) => ({ label: b.label, count: rdistCounts[i] }))

  // setupPerformance — materialize map preserving insertion order (Map spec
  // guarantees insertion order; the reference impl also relies on it).
  const setup: SetupStat[] = []
  for (const [setupType, b] of setupMap) {
    setup.push({
      setupType,
      winRate: b.wins / b.count,
      avgR: b.rCount > 0 ? b.rSum / b.rCount : 0,
      count: b.count,
    })
  }

  // pnlByTicker — materialize + sort descending by totalPnl.
  const ticker: TickerStat[] = []
  for (const [tickerName, b] of tickerMap) {
    ticker.push({
      ticker: tickerName,
      totalPnl: b.totalPnl,
      tradeCount: b.tradeCount,
      winRate: b.winCount / b.tradeCount,
    })
  }
  ticker.sort((a, b) => b.totalPnl - a.totalPnl)

  // pnlByHour — materialize + sort ascending by hour.
  const hour: HourStat[] = []
  for (const b of hourMap.values()) {
    hour.push({ hour: b.hour, totalPnl: b.totalPnl, tradeCount: b.tradeCount })
  }
  hour.sort((a, b) => a.hour - b.hour)

  return {
    stats,
    equity,
    rdist,
    setup,
    ticker,
    holdWins,
    holdLoss,
    holdOther,
    dayofweek: dayStats,
    hour,
  }
}
