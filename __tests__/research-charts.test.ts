import { describe, it, expect } from 'vitest'
import { pnlByTicker, holdTimeVsR, pnlByDayOfWeek, pnlByHour } from '@/lib/utils/research-charts'
import type { ClosedTrade } from '@/types/trade'

// pnlByDayOfWeek / pnlByHour bucket trades in the browser's LOCAL timezone
// (matching the trade-detail modal's display, not UTC). Test fixtures use
// the local-component Date constructor `new Date(y, mo, d, h, ...)` so the
// expected day-of-week and hour are TZ-independent — they hold regardless
// of whether CI runs in UTC, Asia/Jerusalem, America/New_York, etc.
// Tuesday 2026-01-06, local 14:00 / 10:00 (4 hours apart by construction).
const LOCAL_OPEN  = new Date(2026, 0, 6, 10, 0, 0) // local Tuesday 10:00
const LOCAL_CLOSE = new Date(2026, 0, 6, 14, 0, 0) // local Tuesday 14:00

function makeTrade(overrides: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id: 'test',
    ticker: 'AAPL',
    direction: 'Long',
    setupType: 'breakout',
    openedAt: LOCAL_OPEN,
    closedAt: LOCAL_CLOSE,
    actualR: 1.5,
    realizedPnl: 300,
    avgEntryPrice: 150,
    avgExitPrice: 155,
    stopPrice: 148,
    totalQuantityOpened: 100,
    result: 'Win',
    executionQuality: 8,
    ...overrides,
  }
}

// ─── pnlByTicker ─────────────────────────────────────────────────────────────

describe('pnlByTicker', () => {
  it('empty array → []', () => {
    expect(pnlByTicker([])).toEqual([])
  })

  it('single trade → correct fields', () => {
    const result = pnlByTicker([makeTrade()])
    expect(result).toHaveLength(1)
    expect(result[0].ticker).toBe('AAPL')
    expect(result[0].totalPnl).toBe(300)
    expect(result[0].tradeCount).toBe(1)
    expect(result[0].winRate).toBe(1)
  })

  it('two trades same ticker → aggregated', () => {
    const trades = [
      makeTrade({ realizedPnl: 300, result: 'Win' }),
      makeTrade({ realizedPnl: -100, result: 'Loss' }),
    ]
    const result = pnlByTicker(trades)
    expect(result).toHaveLength(1)
    expect(result[0].totalPnl).toBeCloseTo(200)
    expect(result[0].tradeCount).toBe(2)
    expect(result[0].winRate).toBe(0.5)
  })

  it('two different tickers → sorted descending by totalPnl', () => {
    const trades = [
      makeTrade({ ticker: 'TSLA', realizedPnl: -50 }),
      makeTrade({ ticker: 'AAPL', realizedPnl: 400, result: 'Win' }),
    ]
    const result = pnlByTicker(trades)
    expect(result[0].ticker).toBe('AAPL')
    expect(result[1].ticker).toBe('TSLA')
  })

  it('null realizedPnl skipped', () => {
    const trades = [
      makeTrade({ ticker: 'AAPL', realizedPnl: 100, result: 'Win' }),
      makeTrade({ ticker: 'TSLA', realizedPnl: null as unknown as number }),
    ]
    const result = pnlByTicker(trades)
    expect(result).toHaveLength(1)
    expect(result[0].ticker).toBe('AAPL')
  })

  it('winRate = 0 when all losses', () => {
    const trades = [
      makeTrade({ result: 'Loss', realizedPnl: -100, actualR: -1 }),
      makeTrade({ result: 'Loss', realizedPnl: -200, actualR: -2 }),
    ]
    const result = pnlByTicker(trades)
    expect(result[0].winRate).toBe(0)
  })
})

// ─── holdTimeVsR ─────────────────────────────────────────────────────────────

describe('holdTimeVsR', () => {
  it('empty array → []', () => {
    expect(holdTimeVsR([])).toEqual([])
  })

  it('calculates holdHours correctly (4 hours)', () => {
    // openedAt 10:00, closedAt 14:00 → exactly 4 hours (TZ-independent)
    const result = holdTimeVsR([makeTrade()])
    expect(result).toHaveLength(1)
    expect(result[0].holdHours).toBeCloseTo(4)
    expect(result[0].actualR).toBe(1.5)
    expect(result[0].ticker).toBe('AAPL')
    expect(result[0].result).toBe('Win')
  })

  it('holdHours is never negative (closedAt before openedAt → 0)', () => {
    const t = makeTrade({
      openedAt: new Date(2026, 0, 6, 14, 0, 0),
      closedAt: new Date(2026, 0, 6, 10, 0, 0),
    })
    const result = holdTimeVsR([t])
    expect(result[0].holdHours).toBe(0)
  })

  it('null actualR → point skipped', () => {
    const trades = [
      makeTrade({ actualR: null as unknown as number }),
      makeTrade({ actualR: 2, ticker: 'TSLA' }),
    ]
    const result = holdTimeVsR(trades)
    expect(result).toHaveLength(1)
    expect(result[0].ticker).toBe('TSLA')
  })

  it('null result → result field becomes empty string', () => {
    const result = holdTimeVsR([makeTrade({ result: null })])
    expect(result[0].result).toBe('')
  })

  it('multi-day hold → hours > 24', () => {
    const t = makeTrade({
      openedAt: new Date(2026, 0, 6, 10, 0, 0),
      closedAt: new Date(2026, 0, 8, 10, 0, 0), // 2 days later
    })
    const result = holdTimeVsR([t])
    expect(result[0].holdHours).toBeCloseTo(48)
  })
})

// ─── pnlByDayOfWeek ──────────────────────────────────────────────────────────

describe('pnlByDayOfWeek', () => {
  it('empty array → all 7 days with zero values', () => {
    const result = pnlByDayOfWeek([])
    expect(result).toHaveLength(7)
    result.forEach(d => {
      expect(d.totalPnl).toBe(0)
      expect(d.tradeCount).toBe(0)
    })
  })

  it('Hebrew day names in correct order (Sun=0 through Sat=6)', () => {
    const result = pnlByDayOfWeek([])
    expect(result[0].day).toBe('ראשון')
    expect(result[1].day).toBe('שני')
    expect(result[2].day).toBe('שלישי')
    expect(result[3].day).toBe('רביעי')
    expect(result[4].day).toBe('חמישי')
    expect(result[5].day).toBe('שישי')
    expect(result[6].day).toBe('שבת')
  })

  it('trade on Tuesday (getDay()=2) updates שלישי slot', () => {
    // 2026-01-06 is Tuesday (local)
    const t = makeTrade({
      closedAt: new Date(2026, 0, 6, 14, 0, 0),
      realizedPnl: 300,
    })
    const result = pnlByDayOfWeek([t])
    const tuesday = result[2]
    expect(tuesday.day).toBe('שלישי')
    expect(tuesday.totalPnl).toBeCloseTo(300)
    expect(tuesday.tradeCount).toBe(1)
    // other days unchanged
    expect(result[0].tradeCount).toBe(0)
    expect(result[1].tradeCount).toBe(0)
  })

  it('multiple trades same day → accumulated', () => {
    const trades = [
      makeTrade({ closedAt: new Date(2026, 0, 6, 10, 0, 0), realizedPnl: 100 }),
      makeTrade({ closedAt: new Date(2026, 0, 6, 14, 0, 0), realizedPnl: 200 }),
    ]
    const result = pnlByDayOfWeek(trades)
    expect(result[2].totalPnl).toBeCloseTo(300)
    expect(result[2].tradeCount).toBe(2)
  })

  it('null realizedPnl → skipped', () => {
    const t = makeTrade({ realizedPnl: null as unknown as number })
    const result = pnlByDayOfWeek([t])
    result.forEach(d => expect(d.tradeCount).toBe(0))
  })
})

// ─── pnlByHour ───────────────────────────────────────────────────────────────

describe('pnlByHour', () => {
  it('empty array → []', () => {
    expect(pnlByHour([])).toEqual([])
  })

  it('single trade → correct hour slot', () => {
    // closedAt local 14:00 → hour 14 (TZ-independent)
    const result = pnlByHour([makeTrade()])
    expect(result).toHaveLength(1)
    expect(result[0].hour).toBe(14)
    expect(result[0].totalPnl).toBeCloseTo(300)
    expect(result[0].tradeCount).toBe(1)
  })

  it('two trades same hour → accumulated', () => {
    const trades = [
      makeTrade({ closedAt: new Date(2026, 0, 6, 14, 0, 0),  realizedPnl: 100 }),
      makeTrade({ closedAt: new Date(2026, 0, 6, 14, 30, 0), realizedPnl: 200 }),
    ]
    const result = pnlByHour(trades)
    expect(result).toHaveLength(1)
    expect(result[0].hour).toBe(14)
    expect(result[0].totalPnl).toBeCloseTo(300)
    expect(result[0].tradeCount).toBe(2)
  })

  it('trades at different hours → sorted ascending by hour', () => {
    const trades = [
      makeTrade({ closedAt: new Date(2026, 0, 6, 15, 0, 0), realizedPnl: 50 }),
      makeTrade({ closedAt: new Date(2026, 0, 6, 9, 0, 0),  realizedPnl: 100 }),
      makeTrade({ closedAt: new Date(2026, 0, 6, 12, 0, 0), realizedPnl: -20 }),
    ]
    const result = pnlByHour(trades)
    expect(result.map(r => r.hour)).toEqual([9, 12, 15])
  })

  it('null realizedPnl → skipped', () => {
    const trades = [
      makeTrade({ realizedPnl: null as unknown as number, closedAt: new Date(2026, 0, 6, 14, 0, 0) }),
      makeTrade({ realizedPnl: 100, closedAt: new Date(2026, 0, 6, 15, 0, 0) }),
    ]
    const result = pnlByHour(trades)
    expect(result).toHaveLength(1)
    expect(result[0].hour).toBe(15)
  })

  it('pre/post-market hours are not filtered out', () => {
    const trades = [
      makeTrade({ closedAt: new Date(2026, 0, 6, 4, 0, 0),  realizedPnl: 50 }),   // 4am local
      makeTrade({ closedAt: new Date(2026, 0, 6, 21, 0, 0), realizedPnl: -30 }), // 9pm local
    ]
    const result = pnlByHour(trades)
    const hours = result.map(r => r.hour)
    expect(hours).toContain(4)
    expect(hours).toContain(21)
  })
})
