/**
 * P1-C — aggregation tools.
 *
 * The load-bearing suite here is the parity block: these tools exist so the
 * assistant quotes the same numbers the research dashboard renders, and the
 * only way that stays true is by asserting against `computeResearchAggregates`
 * on the same fixture rather than against hand-written expectations.
 */

import { describe, it, expect } from 'vitest'
import {
  aggregationTools,
  getSetupBreakdown,
  getTickerBreakdown,
  getDayHourBreakdown,
  getExecutionQualityBreakdown,
  getEmotionalStateBreakdown,
  getHoldTimeVsRSummary,
} from '@/lib/chat/tools/aggregations'
import { toolsForMode, type ToolContext } from '@/lib/chat/tools/types'
import type { ChatContextMode, ChatTrade } from '@/lib/chat/context-builder'
import { computeResearchAggregates, type ResearchAggregates } from '@/lib/utils/research-aggregate'

// Local-time constructor so day-of-week / hour buckets are TZ-independent —
// same trick as __tests__/research-aggregate.test.ts.
function d(mo: number, day: number, h: number, m = 0): Date {
  return new Date(2026, mo, day, h, m, 0)
}

function makeTrade(over: Partial<ChatTrade> & { id: string }): ChatTrade {
  return {
    ticker: 'AAPL',
    direction: 'Long',
    setupType: 'breakout',
    openedAt: d(0, 6, 10),
    closedAt: d(0, 6, 14),
    actualR: 1,
    realizedPnl: 100,
    avgEntryPrice: 100,
    avgExitPrice: 110,
    stopPrice: 95,
    totalQuantityOpened: 100,
    result: 'Win',
    executionQuality: null,
    emotionalState: null,
    ...over,
  }
}

function makeCtx(trades: ChatTrade[], mode: ChatContextMode = 'full'): ToolContext {
  let cached: ResearchAggregates | null = null
  return {
    trades,
    mode,
    fetchFreeText: async () => new Map(),
    aggregates: () => (cached ??= computeResearchAggregates(trades)),
  }
}

const r4 = (n: number) => Math.round(n * 10000) / 10000

// Varied fixture: several setups, tickers, days/hours, results, and both
// null-actualR and null-realizedPnl edges.
const fixture: ChatTrade[] = [
  makeTrade({ id: '1', ticker: 'AAPL', setupType: 'breakout',     actualR: 2,    realizedPnl: 200,  result: 'Win',       openedAt: d(0, 6, 10),  closedAt: d(0, 6, 14) }),
  makeTrade({ id: '2', ticker: 'AAPL', setupType: 'breakout',     actualR: -1,   realizedPnl: -100, result: 'Loss',      openedAt: d(0, 7, 9),   closedAt: d(0, 7, 15) }),
  makeTrade({ id: '3', ticker: 'TSLA', setupType: 'pullback_ema', actualR: 1.5,  realizedPnl: 150,  result: 'Win',       openedAt: d(0, 5, 8),   closedAt: d(0, 5, 10) }),
  makeTrade({ id: '4', ticker: 'TSLA', setupType: 'pullback_ema', actualR: 0.5,  realizedPnl: 50,   result: 'Win',       openedAt: d(0, 8, 9),   closedAt: d(0, 8, 11) }),
  makeTrade({ id: '5', ticker: 'MSFT', setupType: null,           actualR: -2,   realizedPnl: -200, result: 'Loss',      openedAt: d(0, 8, 12),  closedAt: d(0, 9, 12) }),
  makeTrade({ id: '6', ticker: 'MSFT', setupType: null,           actualR: 3,    realizedPnl: 300,  result: 'Win',       openedAt: d(0, 10, 4),  closedAt: d(0, 10, 21) }),
  makeTrade({ id: '7', ticker: 'NVDA', setupType: 'breakout',     actualR: -3,   realizedPnl: -300, result: 'Loss',      openedAt: d(0, 6, 3),   closedAt: d(0, 6, 4) }),
  makeTrade({ id: '8', ticker: 'NVDA', setupType: 'breakout',     actualR: 0,    realizedPnl: 0,    result: 'Breakeven', openedAt: d(0, 12, 10), closedAt: d(0, 12, 16) }),
  // No stop → no R-multiple. Still counted in $-based metrics.
  makeTrade({ id: '9',  ticker: 'AMD', setupType: 'gap_fill', actualR: null, stopPrice: null, realizedPnl: 75,  result: 'Win',  openedAt: d(0, 13, 8),  closedAt: d(0, 13, 9) }),
  makeTrade({ id: '10', ticker: 'AMD', setupType: 'gap_fill', actualR: null, stopPrice: null, realizedPnl: -50, result: 'Loss', openedAt: d(0, 14, 14), closedAt: d(0, 14, 15) }),
  // Result outside Win/Loss — lands in the aggregate's holdOther array.
  makeTrade({ id: '11', ticker: 'META', setupType: 'breakout', actualR: 0.75, realizedPnl: 75, result: 'Partial', openedAt: d(0, 16, 11), closedAt: d(0, 16, 13) }),
]

// ─────────────────────────────────────────────────────────────────────────────
// Parity with the dashboard aggregate
// ─────────────────────────────────────────────────────────────────────────────

describe('parity with computeResearchAggregates', () => {
  const ctx = makeCtx(fixture)
  const agg = computeResearchAggregates(fixture)

  it('getSetupBreakdown matches setup stats row-for-row (no "אחר" rows in this fixture)', () => {
    const { setups, totalTrades } = getSetupBreakdown.execute({}, ctx) as {
      setups: Array<{ setupType: string; tradeCount: number; winRate: number; avgR: number | null }>
      totalTrades: number
    }
    expect(totalTrades).toBe(fixture.length)
    expect(setups).toHaveLength(agg.setup.length)

    for (const ref of agg.setup) {
      const row = setups.find(s => s.setupType === ref.setupType)
      expect(row, `missing setup ${ref.setupType}`).toBeDefined()
      expect(row!.tradeCount).toBe(ref.count)
      expect(row!.winRate).toBe(r4(ref.winRate))
      // gap_fill is the only stopless group — the aggregate reports 0 there,
      // the tool reports null. Everywhere else the value must match.
      const hasR = fixture.some(t => (t.setupType ?? 'untagged') === ref.setupType && t.actualR != null)
      expect(row!.avgR).toBe(hasR ? r4(ref.avgR) : null)
    }
  })

  it('getSetupBreakdown maps null setupType to "untagged", like the dashboard', () => {
    const { setups } = getSetupBreakdown.execute({}, ctx) as { setups: Array<{ setupType: string }> }
    expect(setups.map(s => s.setupType)).toContain('untagged')
  })

  it('getTickerBreakdown matches pnlByTicker rows and ordering', () => {
    const res = getTickerBreakdown.execute({ limit: 100 }, ctx) as {
      tickers: Array<{ ticker: string; totalPnl: number; tradeCount: number; winRate: number }>
      totalTickers: number
      hasMore: boolean
    }
    expect(res.totalTickers).toBe(agg.ticker.length)
    expect(res.hasMore).toBe(false)
    expect(res.tickers).toEqual(
      agg.ticker.map(t => ({
        ticker: t.ticker,
        totalPnl: r4(t.totalPnl),
        tradeCount: t.tradeCount,
        winRate: r4(t.winRate),
      })),
    )
  })

  it('getDayHourBreakdown matches pnlByDayOfWeek / pnlByHour exactly', () => {
    const res = getDayHourBreakdown.execute({}, ctx) as {
      byDayOfWeek: Array<{ day: string; totalPnl: number; tradeCount: number }>
      byHour: Array<{ hour: number; totalPnl: number; tradeCount: number }>
    }
    expect(res.byDayOfWeek).toEqual(
      agg.dayofweek.map(x => ({ day: x.day, totalPnl: r4(x.totalPnl), tradeCount: x.tradeCount })),
    )
    expect(res.byHour).toEqual(
      agg.hour.map(x => ({ hour: x.hour, totalPnl: r4(x.totalPnl), tradeCount: x.tradeCount })),
    )
  })

  it('getDayHourBreakdown buckets by entry time, not close time (P12)', () => {
    // Opens Monday 09:00, closes Thursday 15:00. Bucketed on the open.
    const t = makeTrade({ id: 'x', openedAt: d(0, 5, 9), closedAt: d(0, 8, 15), realizedPnl: 500 })
    const res = getDayHourBreakdown.execute({}, makeCtx([t])) as {
      byDayOfWeek: Array<{ day: string; totalPnl: number; tradeCount: number }>
      byHour: Array<{ hour: number; totalPnl: number }>
    }
    const openDayIdx = t.openedAt.getDay()
    expect(res.byDayOfWeek[openDayIdx].tradeCount).toBe(1)
    expect(res.byDayOfWeek[t.closedAt.getDay()].tradeCount).toBe(0)
    expect(res.byHour).toEqual([{ hour: 9, totalPnl: 500, tradeCount: 1 }])
  })

  it('the tool description states the entry-time bucketing so the model reports it right', () => {
    expect(getDayHourBreakdown.declaration.description).toMatch(/ENTRY time/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// "אחר" collapsing
// ─────────────────────────────────────────────────────────────────────────────

describe('getSetupBreakdown — "אחר" collapsing', () => {
  // 10 trades under a hyphen-dash custom setup (8 wins, avgR 2.0) and 2 under
  // an en-dash one (0 wins, avgR -1.0). Naive averaging of the two rows would
  // give winRate 0.4 / avgR 0.5; the weighted answer is 0.6667 / 1.5.
  const trades: ChatTrade[] = [
    ...Array.from({ length: 8 }, (_, i) =>
      makeTrade({ id: `w${i}`, setupType: 'אחר - חדשות', actualR: 2.75, realizedPnl: 100, result: 'Win' }),
    ),
    ...Array.from({ length: 2 }, (_, i) =>
      makeTrade({ id: `l${i}`, setupType: 'אחר - חדשות', actualR: -1, realizedPnl: -100, result: 'Loss' }),
    ),
    ...Array.from({ length: 2 }, (_, i) =>
      makeTrade({ id: `f${i}`, setupType: 'אחר – FOMO', actualR: -1, realizedPnl: -100, result: 'Loss' }),
    ),
  ]
  const res = getSetupBreakdown.execute({}, makeCtx(trades)) as {
    setups: Array<{ setupType: string; tradeCount: number; winRate: number; avgR: number | null }>
  }

  it('merges both dash variants into a single "אחר" bucket', () => {
    expect(res.setups).toHaveLength(1)
    expect(res.setups[0].setupType).toBe('אחר')
    expect(res.setups[0].tradeCount).toBe(12)
  })

  it('weights winRate by trade count rather than averaging the rates', () => {
    expect(res.setups[0].winRate).toBe(r4(8 / 12))
    expect(res.setups[0].winRate).not.toBe(0.4) // the naive answer
  })

  it('weights avgR by R-trade count rather than averaging the averages', () => {
    // (8×2.75 + 2×-1 + 2×-1) / 12 = 18 / 12
    expect(res.setups[0].avgR).toBe(1.5)
    expect(res.setups[0].avgR).not.toBe(0.5) // the naive answer
  })

  it('leaves a non-custom setup alongside the collapsed bucket untouched', () => {
    const mixed = [...trades, makeTrade({ id: 'b1', setupType: 'breakout', actualR: 1, realizedPnl: 100 })]
    const out = getSetupBreakdown.execute({}, makeCtx(mixed)) as {
      setups: Array<{ setupType: string; tradeCount: number }>
    }
    expect(out.setups.map(s => s.setupType).sort()).toEqual(['breakout', 'אחר'])
    expect(out.setups.find(s => s.setupType === 'breakout')!.tradeCount).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// avgR null semantics
// ─────────────────────────────────────────────────────────────────────────────

describe('avgR is null — never 0, never NaN — when a group has no R-multiple', () => {
  const stopless = [
    makeTrade({ id: 'n1', setupType: 'gap_fill', actualR: null, stopPrice: null, realizedPnl: 100, result: 'Win', executionQuality: 5, emotionalState: 'רגוע' }),
    makeTrade({ id: 'n2', setupType: 'gap_fill', actualR: null, stopPrice: null, realizedPnl: -40, result: 'Loss', executionQuality: 5, emotionalState: 'רגוע' }),
  ]
  const ctx = makeCtx(stopless)

  it('getSetupBreakdown', () => {
    const { setups } = getSetupBreakdown.execute({}, ctx) as { setups: Array<{ avgR: number | null }> }
    expect(setups[0].avgR).toBeNull()
  })

  it('getExecutionQualityBreakdown', () => {
    const { scores } = getExecutionQualityBreakdown.execute({}, ctx) as { scores: Array<{ avgR: number | null }> }
    expect(scores[0].avgR).toBeNull()
  })

  it('getEmotionalStateBreakdown', () => {
    const { states } = getEmotionalStateBreakdown.execute({}, ctx) as { states: Array<{ avgR: number | null }> }
    expect(states[0].avgR).toBeNull()
  })

  it('getHoldTimeVsRSummary reports every bucket as null when nothing has an R', () => {
    const { buckets, tradesWithR } = getHoldTimeVsRSummary.execute({}, ctx) as {
      buckets: Array<{ avgR: number | null }>
      tradesWithR: number
    }
    expect(tradesWithR).toBe(0)
    for (const b of buckets) expect(b.avgR).toBeNull()
  })

  it('a real 0R trade still reports 0, not null', () => {
    const flat = [makeTrade({ id: 'z', setupType: 'breakout', actualR: 0, realizedPnl: 0, result: 'Breakeven' })]
    const { setups } = getSetupBreakdown.execute({}, makeCtx(flat)) as { setups: Array<{ avgR: number | null }> }
    expect(setups[0].avgR).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Ticker limit / ordering
// ─────────────────────────────────────────────────────────────────────────────

describe('getTickerBreakdown — limit, ordering and hasMore', () => {
  // 120 tickers; TCK000 has the most trades but the worst P&L, so the two
  // orderings disagree at the top.
  const many: ChatTrade[] = []
  for (let i = 0; i < 120; i++) {
    const reps = i === 0 ? 5 : 1
    for (let k = 0; k < reps; k++) {
      many.push(makeTrade({
        id: `t${i}-${k}`,
        ticker: `TCK${String(i).padStart(3, '0')}`,
        realizedPnl: i === 0 ? -1000 : i,
        result: i === 0 ? 'Loss' : 'Win',
      }))
    }
  }
  const ctx = makeCtx(many)

  it('defaults to 20 rows', () => {
    const res = getTickerBreakdown.execute({}, ctx) as { returned: number; totalTickers: number; hasMore: boolean }
    expect(res.returned).toBe(20)
    expect(res.totalTickers).toBe(120)
    expect(res.hasMore).toBe(true)
  })

  it('clamps an oversized limit to 100', () => {
    const res = getTickerBreakdown.execute({ limit: 5000 }, ctx) as { returned: number; hasMore: boolean }
    expect(res.returned).toBe(100)
    expect(res.hasMore).toBe(true)
  })

  it('clamps a zero or negative limit to 1', () => {
    expect((getTickerBreakdown.execute({ limit: 0 }, ctx) as { returned: number }).returned).toBe(1)
    expect((getTickerBreakdown.execute({ limit: -3 }, ctx) as { returned: number }).returned).toBe(1)
  })

  it('reports hasMore=false once everything fits', () => {
    const res = getTickerBreakdown.execute({ limit: 100 }, makeCtx(fixture)) as {
      returned: number; totalTickers: number; hasMore: boolean
    }
    expect(res.returned).toBe(res.totalTickers)
    expect(res.hasMore).toBe(false)
  })

  it('orderBy=totalPnl sorts best P&L first', () => {
    const res = getTickerBreakdown.execute({ limit: 3, orderBy: 'totalPnl' }, ctx) as {
      tickers: Array<{ ticker: string; totalPnl: number }>
    }
    expect(res.tickers.map(t => t.ticker)).toEqual(['TCK119', 'TCK118', 'TCK117'])
  })

  it('orderBy=tradeCount sorts most-traded first', () => {
    const res = getTickerBreakdown.execute({ limit: 3, orderBy: 'tradeCount' }, ctx) as {
      tickers: Array<{ ticker: string; tradeCount: number }>
    }
    expect(res.tickers[0].ticker).toBe('TCK000')
    expect(res.tickers[0].tradeCount).toBe(5)
  })

  it('falls back to totalPnl for an unknown orderBy', () => {
    const res = getTickerBreakdown.execute({ orderBy: 'bogus', limit: 1 }, ctx) as {
      tickers: Array<{ ticker: string }>
    }
    expect(res.tickers[0].ticker).toBe('TCK119')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Execution quality
// ─────────────────────────────────────────────────────────────────────────────

describe('getExecutionQualityBreakdown', () => {
  // 3 rated trades out of 10 — the realistic shape, since the field is optional.
  const trades: ChatTrade[] = [
    makeTrade({ id: 'q1', executionQuality: 9, actualR: 2, realizedPnl: 200, result: 'Win' }),
    makeTrade({ id: 'q2', executionQuality: 9, actualR: 1, realizedPnl: 100, result: 'Win' }),
    makeTrade({ id: 'q3', executionQuality: 3, actualR: -1, realizedPnl: -100, result: 'Loss' }),
    ...Array.from({ length: 7 }, (_, i) => makeTrade({ id: `u${i}`, executionQuality: null })),
  ]
  const res = getExecutionQualityBreakdown.execute({}, makeCtx(trades)) as {
    scores: Array<{ score: number; tradeCount: number; winRate: number; avgR: number | null; totalPnl: number }>
    scored: number
    unscored: number
  }

  it('counts scored vs unscored correctly', () => {
    expect(res.scored).toBe(3)
    expect(res.unscored).toBe(7)
  })

  it('returns one row per distinct score, ascending', () => {
    expect(res.scores.map(s => s.score)).toEqual([3, 9])
  })

  it('computes per-score stats over the rated trades only', () => {
    const nine = res.scores.find(s => s.score === 9)!
    expect(nine.tradeCount).toBe(2)
    expect(nine.winRate).toBe(1)
    expect(nine.avgR).toBe(1.5)
    expect(nine.totalPnl).toBe(300)
  })

  it('returns no rows when nothing is rated', () => {
    const none = getExecutionQualityBreakdown.execute({}, makeCtx(fixture)) as {
      scores: unknown[]; scored: number; unscored: number
    }
    expect(none.scores).toEqual([])
    expect(none.scored).toBe(0)
    expect(none.unscored).toBe(fixture.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Emotional state
// ─────────────────────────────────────────────────────────────────────────────

describe('getEmotionalStateBreakdown', () => {
  const trades: ChatTrade[] = [
    makeTrade({ id: 'e1', emotionalState: 'רגוע', realizedPnl: 100, actualR: 1, result: 'Win' }),
    makeTrade({ id: 'e2', emotionalState: 'רגוע', realizedPnl: 100, actualR: 1, result: 'Win' }),
    makeTrade({ id: 'e3', emotionalState: 'רגוע', realizedPnl: -50, actualR: -1, result: 'Loss' }),
    makeTrade({ id: 'e4', emotionalState: 'אחר - עייפות', realizedPnl: -100, actualR: -1, result: 'Loss' }),
    makeTrade({ id: 'e5', emotionalState: 'אחר – לחץ', realizedPnl: -100, actualR: -1, result: 'Loss' }),
    makeTrade({ id: 'e6', emotionalState: null, realizedPnl: 20, actualR: null, result: 'Win' }),
  ]
  const res = getEmotionalStateBreakdown.execute({}, makeCtx(trades)) as {
    states: Array<{ state: string; tradeCount: number; winRate: number; avgR: number | null; totalPnl: number }>
    unspecified: number
  }

  it('sorts by tradeCount descending', () => {
    expect(res.states.map(s => s.tradeCount)).toEqual([3, 2, 1])
    expect(res.states[0].state).toBe('רגוע')
  })

  it('collapses both dash variants into one "אחר" bucket', () => {
    const other = res.states.find(s => s.state === 'אחר')!
    expect(other.tradeCount).toBe(2)
    expect(other.winRate).toBe(0)
    expect(other.avgR).toBe(-1)
    expect(other.totalPnl).toBe(-200)
  })

  it('reports the unspecified count and still buckets those rows as "לא צוין"', () => {
    expect(res.unspecified).toBe(1)
    expect(res.states.find(s => s.state === 'לא צוין')!.tradeCount).toBe(1)
    expect(res.states.reduce((s, x) => s + x.tradeCount, 0)).toBe(trades.length)
  })

  it('computes stats per state', () => {
    const calm = res.states.find(s => s.state === 'רגוע')!
    expect(calm.winRate).toBe(r4(2 / 3))
    expect(calm.avgR).toBe(r4(1 / 3))
    expect(calm.totalPnl).toBe(150)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Hold time
// ─────────────────────────────────────────────────────────────────────────────

describe('getHoldTimeVsRSummary', () => {
  // One trade per bucket, plus the two exact boundary values.
  const hours = (h: number, over: Partial<ChatTrade> & { id: string }) =>
    makeTrade({ openedAt: d(1, 2, 0), closedAt: new Date(d(1, 2, 0).getTime() + h * 3_600_000), ...over })

  const trades: ChatTrade[] = [
    hours(0.5, { id: 'h1', actualR: 1, realizedPnl: 100, result: 'Win' }),   // <1h
    hours(1,   { id: 'h2', actualR: 2, realizedPnl: 200, result: 'Win' }),   // boundary → 1-4h
    hours(3,   { id: 'h3', actualR: -1, realizedPnl: -100, result: 'Loss' }), // 1-4h
    hours(10,  { id: 'h4', actualR: 1, realizedPnl: 50, result: 'Win' }),    // 4-24h
    hours(24,  { id: 'h5', actualR: -2, realizedPnl: -200, result: 'Loss' }), // boundary → 1-3d
    hours(100, { id: 'h6', actualR: 3, realizedPnl: 300, result: 'Win' }),   // 3-7d
    hours(400, { id: 'h7', actualR: 0.5, realizedPnl: 25, result: 'Partial' }), // >7d
    hours(5,   { id: 'h8', actualR: null, stopPrice: null, realizedPnl: 999, result: 'Win' }), // excluded
  ]
  const res = getHoldTimeVsRSummary.execute({}, makeCtx(trades)) as {
    buckets: Array<{ bucket: string; tradeCount: number; winRate: number; avgR: number | null; totalPnl: number }>
    tradesWithR: number
    tradesWithoutR: number
  }
  const bucket = (name: string) => res.buckets.find(b => b.bucket === name)!

  it('returns all six buckets in ascending duration order', () => {
    expect(res.buckets.map(b => b.bucket)).toEqual(['<1h', '1-4h', '4-24h', '1-3d', '3-7d', '>7d'])
  })

  it('never returns raw scatter points', () => {
    const json = JSON.stringify(res)
    expect(json).not.toContain('holdHours')
    expect(json).not.toContain('ticker')
  })

  it('puts exactly 1h in the 1-4h bucket (left-inclusive bins)', () => {
    expect(bucket('1-4h').tradeCount).toBe(2)
    expect(bucket('<1h').tradeCount).toBe(1)
  })

  it('puts exactly 24h in the 1-3d bucket', () => {
    expect(bucket('1-3d').tradeCount).toBe(1)
    expect(bucket('1-3d').avgR).toBe(-2)
    expect(bucket('4-24h').tradeCount).toBe(1)
  })

  it('excludes trades without an R-multiple and says how many', () => {
    expect(res.tradesWithR).toBe(7)
    expect(res.tradesWithoutR).toBe(1)
    // The 999 P&L of the excluded trade must not leak into the 4-24h bucket.
    expect(bucket('4-24h').totalPnl).toBe(50)
  })

  it('computes winRate and totalPnl per bucket', () => {
    expect(bucket('1-4h').winRate).toBe(0.5)
    expect(bucket('1-4h').totalPnl).toBe(100)
    expect(bucket('1-4h').avgR).toBe(0.5)
    expect(bucket('>7d').winRate).toBe(0) // 'Partial' is not a win
  })

  it('leaves empty buckets at zero with a null avgR', () => {
    const only = getHoldTimeVsRSummary.execute({}, makeCtx([hours(2, { id: 'a', actualR: 1 })])) as {
      buckets: Array<{ bucket: string; tradeCount: number; avgR: number | null; totalPnl: number }>
    }
    const empty = only.buckets.find(b => b.bucket === '>7d')!
    expect(empty.tradeCount).toBe(0)
    expect(empty.totalPnl).toBe(0)
    expect(empty.avgR).toBeNull()
  })

  it('clamps a close-before-open trade into the <1h bucket', () => {
    const backwards = [makeTrade({ id: 'b', openedAt: d(1, 3, 14), closedAt: d(1, 3, 10), actualR: 1, realizedPnl: 10 })]
    const out = getHoldTimeVsRSummary.execute({}, makeCtx(backwards)) as {
      buckets: Array<{ bucket: string; tradeCount: number }>
    }
    expect(out.buckets.find(b => b.bucket === '<1h')!.tradeCount).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Registration + empty input
// ─────────────────────────────────────────────────────────────────────────────

describe('tool registration', () => {
  it('exports all six in order', () => {
    expect(aggregationTools.map(t => t.name)).toEqual([
      'getSetupBreakdown',
      'getTickerBreakdown',
      'getDayHourBreakdown',
      'getExecutionQualityBreakdown',
      'getEmotionalStateBreakdown',
      'getHoldTimeVsRSummary',
    ])
  })

  it('smart mode sees only the three annotation-free tools', () => {
    expect(toolsForMode(aggregationTools, 'smart').map(t => t.name)).toEqual([
      'getSetupBreakdown',
      'getTickerBreakdown',
      'getDayHourBreakdown',
    ])
  })

  it('full mode sees all six', () => {
    expect(toolsForMode(aggregationTools, 'full')).toHaveLength(6)
  })

  it('every declaration name matches its tool name and carries a description', () => {
    for (const t of aggregationTools) {
      expect(t.declaration.name).toBe(t.name)
      expect(t.declaration.description!.length).toBeGreaterThan(40)
    }
  })
})

describe('empty trade set', () => {
  const ctx = makeCtx([])

  it('no tool throws', () => {
    for (const t of aggregationTools) {
      expect(() => t.execute({}, ctx), t.name).not.toThrow()
    }
  })

  it('returns empty groups and zeroed counts', () => {
    expect(getSetupBreakdown.execute({}, ctx)).toEqual({ setups: [], totalTrades: 0 })
    expect(getTickerBreakdown.execute({}, ctx)).toEqual({
      tickers: [], returned: 0, totalTickers: 0, hasMore: false,
    })
    expect(getExecutionQualityBreakdown.execute({}, ctx)).toEqual({ scores: [], scored: 0, unscored: 0 })
    expect(getEmotionalStateBreakdown.execute({}, ctx)).toEqual({ states: [], unspecified: 0 })

    const day = getDayHourBreakdown.execute({}, ctx) as {
      byDayOfWeek: unknown[]; byHour: unknown[]
    }
    expect(day.byDayOfWeek).toHaveLength(7)
    expect(day.byHour).toEqual([])

    const hold = getHoldTimeVsRSummary.execute({}, ctx) as {
      buckets: Array<{ tradeCount: number }>; tradesWithR: number; tradesWithoutR: number
    }
    expect(hold.buckets).toHaveLength(6)
    expect(hold.buckets.every(b => b.tradeCount === 0)).toBe(true)
    expect(hold.tradesWithR).toBe(0)
    expect(hold.tradesWithoutR).toBe(0)
  })
})
