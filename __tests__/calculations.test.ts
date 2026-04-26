import { describe, it, expect } from 'vitest'
import { calcStats, equityCurve, rDistribution, setupPerformance } from '@/lib/utils/calculations'
import type { ClosedTrade } from '@/types/trade'

function makeTrade(overrides: Partial<ClosedTrade> & { actualR: number; realizedPnl: number }): ClosedTrade {
  return {
    id: 'test',
    ticker: 'AAPL',
    direction: 'Long',
    setupType: null,
    openedAt: new Date('2026-01-01'),
    closedAt: new Date('2026-01-02'),
    avgEntryPrice: 100,
    avgExitPrice: 110,
    stopPrice: 95,
    totalQuantityOpened: 100,
    result: overrides.actualR > 0 ? 'Win' : overrides.actualR < 0 ? 'Loss' : 'Breakeven',
    executionQuality: null,
    ...overrides,
  }
}

// ─── calcStats ───────────────────────────────────────────────────────────────

describe('calcStats', () => {
  it('empty array → all zeros, no throw', () => {
    const s = calcStats([])
    expect(s.totalTrades).toBe(0)
    expect(s.winRate).toBe(0)
    expect(s.avgR).toBe(0)
    expect(s.profitFactor).toBe(0)
    expect(s.expectancy).toBe(0)
    expect(s.maxDrawdown).toBe(0)
    expect(s.totalPnl).toBe(0)
  })

  it('all wins → profitFactor=999, winRate=1', () => {
    const trades = [
      makeTrade({ actualR: 2, realizedPnl: 200 }),
      makeTrade({ actualR: 1, realizedPnl: 100 }),
    ]
    const s = calcStats(trades)
    expect(s.winRate).toBe(1)
    expect(s.profitFactor).toBe(999)
    expect(s.avgLoss).toBe(0)
  })

  it('all losses → winRate=0, avgWin=0', () => {
    const trades = [
      makeTrade({ actualR: -1, realizedPnl: -100 }),
      makeTrade({ actualR: -2, realizedPnl: -200 }),
    ]
    const s = calcStats(trades)
    expect(s.winRate).toBe(0)
    expect(s.avgWin).toBe(0)
    expect(s.avgLoss).toBeLessThan(0)
  })

  it('mixed: 2 wins 1 loss — expectancy formula', () => {
    const trades = [
      makeTrade({ actualR: 2, realizedPnl: 200 }),
      makeTrade({ actualR: 1, realizedPnl: 100 }),
      makeTrade({ actualR: -1, realizedPnl: -100 }),
    ]
    const s = calcStats(trades)
    expect(s.winRate).toBeCloseTo(2 / 3, 6)
    expect(s.avgR).toBeCloseTo((2 + 1 - 1) / 3, 6)
    // expectancy = winRate * avgWin + (1-winRate) * avgLoss
    const expectedExpectancy = (2 / 3) * 1.5 + (1 / 3) * (-1)
    expect(s.expectancy).toBeCloseTo(expectedExpectancy, 6)
    expect(s.profitFactor).toBeCloseTo(3 / 1, 6)
  })

  it('maxDrawdown: [+1, +1, -3, +1] → peak=2, trough=-1 → dd=-3', () => {
    const base = new Date('2026-01-01')
    const trades = [
      makeTrade({ actualR: 1, realizedPnl: 100, closedAt: new Date(base.getTime() + 0) }),
      makeTrade({ actualR: 1, realizedPnl: 100, closedAt: new Date(base.getTime() + 1) }),
      makeTrade({ actualR: -3, realizedPnl: -300, closedAt: new Date(base.getTime() + 2) }),
      makeTrade({ actualR: 1, realizedPnl: 100, closedAt: new Date(base.getTime() + 3) }),
    ]
    const s = calcStats(trades)
    // peak at 2R, then drops to -1R → maxDrawdown = -3
    expect(s.maxDrawdown).toBeCloseTo(-3, 6)
  })

  it('single breakeven trade', () => {
    const trades = [makeTrade({ actualR: 0, realizedPnl: 0 })]
    const s = calcStats(trades)
    expect(s.winRate).toBe(0)
    expect(s.avgR).toBe(0)
    // no wins, no losses → profitFactor = 999 (no loss denominator)
    expect(s.profitFactor).toBe(999)
  })
})

// ─── equityCurve ─────────────────────────────────────────────────────────────

describe('equityCurve', () => {
  it('empty → empty array', () => {
    expect(equityCurve([])).toEqual([])
  })

  it('sorts by closedAt regardless of input order', () => {
    const t1 = makeTrade({ actualR: 1, realizedPnl: 100, closedAt: new Date('2026-01-03') })
    const t2 = makeTrade({ actualR: 2, realizedPnl: 200, closedAt: new Date('2026-01-01') })
    const t3 = makeTrade({ actualR: -1, realizedPnl: -100, closedAt: new Date('2026-01-02') })
    const curve = equityCurve([t1, t2, t3])
    expect(curve[0].cumulativeR).toBeCloseTo(2, 6)   // t2 first
    expect(curve[1].cumulativeR).toBeCloseTo(1, 6)   // t3 second (+2-1)
    expect(curve[2].cumulativeR).toBeCloseTo(2, 6)   // t1 third (+1)
  })

  it('cumulative R accumulates correctly', () => {
    const trades = [
      makeTrade({ actualR: 1, realizedPnl: 100, closedAt: new Date('2026-01-01') }),
      makeTrade({ actualR: 2, realizedPnl: 200, closedAt: new Date('2026-01-02') }),
      makeTrade({ actualR: -1, realizedPnl: -100, closedAt: new Date('2026-01-03') }),
    ]
    const curve = equityCurve(trades)
    expect(curve[0].cumulativeR).toBeCloseTo(1, 6)
    expect(curve[1].cumulativeR).toBeCloseTo(3, 6)
    expect(curve[2].cumulativeR).toBeCloseTo(2, 6)
  })
})

// ─── rDistribution ───────────────────────────────────────────────────────────

describe('rDistribution', () => {
  it('empty → all bins zero', () => {
    const bins = rDistribution([])
    expect(bins.every(b => b.count === 0)).toBe(true)
    expect(bins).toHaveLength(6)
  })

  it('actualR=0 → falls in "0R–1R" bin (left-exclusive)', () => {
    const bins = rDistribution([makeTrade({ actualR: 0, realizedPnl: 0 })])
    const zeroOneBin = bins.find(b => b.label === '0R–1R')
    expect(zeroOneBin?.count).toBe(1)
  })

  it('actualR=2 → falls in ">2R" bin (left-exclusive: 2 is not in 1R–2R)', () => {
    const bins = rDistribution([makeTrade({ actualR: 2, realizedPnl: 200 })])
    const gt2Bin = bins.find(b => b.label === '>2R')
    expect(gt2Bin?.count).toBe(1)
  })

  it('actualR=-2 → falls in "-2R–-1R" bin (right-inclusive)', () => {
    const bins = rDistribution([makeTrade({ actualR: -2, realizedPnl: -200 })])
    const binLabel = bins.find(b => b.label === '-2R–-1R')
    expect(binLabel?.count).toBe(1)
  })

  it('distributes mixed trades correctly', () => {
    const trades = [
      makeTrade({ actualR: 3, realizedPnl: 300 }),   // >2R
      makeTrade({ actualR: 1.5, realizedPnl: 150 }), // 1R–2R
      makeTrade({ actualR: 0.5, realizedPnl: 50 }),  // 0R–1R
      makeTrade({ actualR: -0.5, realizedPnl: -50 }),// -1R–0R
      makeTrade({ actualR: -1.5, realizedPnl: -150 }),// -2R–-1R
      makeTrade({ actualR: -3, realizedPnl: -300 }), // <-2R
    ]
    const bins = rDistribution(trades)
    for (const bin of bins) {
      expect(bin.count).toBe(1)
    }
  })
})

// ─── setupPerformance ────────────────────────────────────────────────────────

describe('setupPerformance', () => {
  it('empty → empty array', () => {
    expect(setupPerformance([])).toEqual([])
  })

  it('null setupType → grouped as "untagged"', () => {
    const trades = [makeTrade({ actualR: 1, realizedPnl: 100, setupType: null })]
    const stats = setupPerformance(trades)
    expect(stats[0].setupType).toBe('untagged')
  })

  it('groups by setupType and computes winRate + avgR', () => {
    const trades = [
      makeTrade({ actualR: 2, realizedPnl: 200, setupType: 'breakout' }),
      makeTrade({ actualR: -1, realizedPnl: -100, setupType: 'breakout' }),
      makeTrade({ actualR: 1, realizedPnl: 100, setupType: 'pullback_ema' }),
    ]
    const stats = setupPerformance(trades)
    const breakout = stats.find(s => s.setupType === 'breakout')!
    expect(breakout.count).toBe(2)
    expect(breakout.winRate).toBe(0.5)
    expect(breakout.avgR).toBeCloseTo(0.5, 6)

    const pullback = stats.find(s => s.setupType === 'pullback_ema')!
    expect(pullback.winRate).toBe(1)
    expect(pullback.avgR).toBe(1)
  })
})
