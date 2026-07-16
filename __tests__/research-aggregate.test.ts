/**
 * Golden regression test for the P9 single-walk aggregator.
 *
 * Asserts that `computeResearchAggregates(trades)` produces output equal to
 * calling the original per-chart helpers one-by-one. If a future edit drifts
 * from the reference implementation, this test fails and the offender is
 * exactly the one who broke user-visible numbers.
 */

import { describe, it, expect } from 'vitest'
import type { ClosedTrade } from '@/types/trade'
import { calcStats, equityCurve, rDistribution, setupPerformance } from '@/lib/utils/calculations'
import { pnlByTicker, holdTimeVsR, pnlByDayOfWeek, pnlByHour } from '@/lib/utils/research-charts'
import { computeResearchAggregates } from '@/lib/utils/research-aggregate'

// Deterministic local-timestamped fixture so day/hour buckets are TZ-independent.
function d(mo: number, day: number, h: number, m = 0): Date {
  return new Date(2026, mo, day, h, m, 0)
}

function makeTrade(overrides: Partial<ClosedTrade>): ClosedTrade {
  return {
    id: 'id',
    ticker: 'AAPL',
    direction: 'Long',
    setupType: 'breakout',
    openedAt: d(0, 6, 10),
    closedAt: d(0, 6, 14),
    avgEntryPrice: 100,
    avgExitPrice: 110,
    stopPrice: 95,
    totalQuantityOpened: 100,
    actualR: 1,
    realizedPnl: 100,
    result: 'Win',
    executionQuality: null,
    ...overrides,
  }
}

// A varied fixture: multiple tickers, setups, results, R-null and pnl-null
// edges, multiple days-of-week + hours, out-of-order close times to exercise
// the sort branches of equity + drawdown + hour.
const fixture: ClosedTrade[] = [
  makeTrade({ id: '1', ticker: 'AAPL', setupType: 'breakout',    actualR: 2,    realizedPnl: 200, result: 'Win',       closedAt: d(0, 6, 14), openedAt: d(0, 6, 10) }),
  makeTrade({ id: '2', ticker: 'AAPL', setupType: 'breakout',    actualR: -1,   realizedPnl: -100, result: 'Loss',     closedAt: d(0, 7, 15), openedAt: d(0, 7, 9) }),
  makeTrade({ id: '3', ticker: 'TSLA', setupType: 'pullback_ema',actualR: 1.5,  realizedPnl: 150, result: 'Win',       closedAt: d(0, 5, 10), openedAt: d(0, 5, 8) }),
  makeTrade({ id: '4', ticker: 'TSLA', setupType: 'pullback_ema',actualR: 0.5,  realizedPnl: 50,  result: 'Win',       closedAt: d(0, 8, 11), openedAt: d(0, 8, 9) }),
  makeTrade({ id: '5', ticker: 'MSFT', setupType: null,          actualR: -2,   realizedPnl: -200, result: 'Loss',     closedAt: d(0, 9, 12), openedAt: d(0, 8, 12) }),
  makeTrade({ id: '6', ticker: 'MSFT', setupType: null,          actualR: 3,    realizedPnl: 300, result: 'Win',       closedAt: d(0, 10, 21), openedAt: d(0, 10, 4) }),
  makeTrade({ id: '7', ticker: 'NVDA', setupType: 'breakout',    actualR: -3,   realizedPnl: -300, result: 'Loss',     closedAt: d(0, 6, 4),  openedAt: d(0, 6, 3) }),
  makeTrade({ id: '8', ticker: 'NVDA', setupType: 'breakout',    actualR: 0,    realizedPnl: 0,   result: 'Breakeven', closedAt: d(0, 12, 16), openedAt: d(0, 12, 10) }),
  // Null actualR (no stop) — counted in $-metrics, skipped in R-based ones
  makeTrade({ id: '9',  ticker: 'AMD', setupType: 'gap_fill', actualR: null as unknown as number, realizedPnl: 75,  result: 'Win',  closedAt: d(0, 13, 9),  openedAt: d(0, 13, 8) }),
  makeTrade({ id: '10', ticker: 'AMD', setupType: 'gap_fill', actualR: null as unknown as number, realizedPnl: -50, result: 'Loss', closedAt: d(0, 14, 15), openedAt: d(0, 14, 14) }),
  // Null realizedPnl — filtered out of pnlByTicker/Day/Hour
  makeTrade({ id: '11', ticker: 'INTC', setupType: 'reversal', actualR: 1,  realizedPnl: null as unknown as number, result: 'Win',  closedAt: d(0, 15, 10), openedAt: d(0, 15, 9) }),
  // Result other than Win/Loss — lands in holdOther
  makeTrade({ id: '12', ticker: 'META', setupType: 'breakout', actualR: 0.75, realizedPnl: 75, result: 'Partial', closedAt: d(0, 16, 13), openedAt: d(0, 16, 11) }),
  // Close-before-open — clamp hold to 0
  makeTrade({ id: '13', ticker: 'GOOG', setupType: 'breakout', actualR: -1, realizedPnl: -100, result: 'Loss', closedAt: d(0, 17, 10), openedAt: d(0, 17, 14) }),
]

describe('computeResearchAggregates — golden regression', () => {
  it('empty input → matches reference helpers on empty', () => {
    const agg = computeResearchAggregates([])
    expect(agg.stats).toEqual(calcStats([]))
    expect(agg.equity).toEqual(equityCurve([]))
    expect(agg.rdist).toEqual(rDistribution([]))
    expect(agg.setup).toEqual(setupPerformance([]))
    expect(agg.ticker).toEqual(pnlByTicker([]))
    expect(agg.dayofweek).toEqual(pnlByDayOfWeek([]))
    expect(agg.hour).toEqual(pnlByHour([]))
    expect(agg.holdWins).toEqual([])
    expect(agg.holdLoss).toEqual([])
    expect(agg.holdOther).toEqual([])
  })

  it('varied fixture → every field matches per-helper output', () => {
    const agg = computeResearchAggregates(fixture)

    // Stats — compared field-by-field with numeric tolerance since totals are
    // floating point sums; the aggregator uses the same op order so exact
    // equality actually holds, but toBeCloseTo protects against harmless FP drift.
    const refStats = calcStats(fixture)
    expect(agg.stats.totalTrades).toBe(refStats.totalTrades)
    expect(agg.stats.rTradeCount).toBe(refStats.rTradeCount)
    expect(agg.stats.winRate).toBeCloseTo(refStats.winRate, 10)
    expect(agg.stats.avgR).toBeCloseTo(refStats.avgR, 10)
    expect(agg.stats.profitFactor).toBeCloseTo(refStats.profitFactor, 10)
    expect(agg.stats.expectancy).toBeCloseTo(refStats.expectancy, 10)
    expect(agg.stats.maxDrawdown).toBeCloseTo(refStats.maxDrawdown, 10)
    expect(agg.stats.totalPnl).toBeCloseTo(refStats.totalPnl, 10)
    expect(agg.stats.avgWin).toBeCloseTo(refStats.avgWin, 10)
    expect(agg.stats.avgLoss).toBeCloseTo(refStats.avgLoss, 10)

    // Structural shapes — deep equal against reference helpers.
    expect(agg.equity).toEqual(equityCurve(fixture))
    expect(agg.rdist).toEqual(rDistribution(fixture))
    expect(agg.setup).toEqual(setupPerformance(fixture))
    expect(agg.ticker).toEqual(pnlByTicker(fixture))
    expect(agg.dayofweek).toEqual(pnlByDayOfWeek(fixture))
    expect(agg.hour).toEqual(pnlByHour(fixture))

    // Hold split — reference is holdTimeVsR then 3 client-side filters. Assert
    // partition equality (the aggregator preserves iteration order like filter does).
    const allHold = holdTimeVsR(fixture)
    expect(agg.holdWins).toEqual(allHold.filter(p => p.result === 'Win'))
    expect(agg.holdLoss).toEqual(allHold.filter(p => p.result === 'Loss'))
    expect(agg.holdOther).toEqual(allHold.filter(p => p.result !== 'Win' && p.result !== 'Loss'))
  })
})
