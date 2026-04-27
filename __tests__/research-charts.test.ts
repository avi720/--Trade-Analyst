import { describe, it, expect } from 'vitest'
import { pnlByTicker, holdTimeVsR, pnlByDayOfWeek, pnlByHour } from '@/lib/utils/research-charts'
import type { ClosedTrade } from '@/types/trade'

function makeTrade(overrides: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id: 'test',
    ticker: 'AAPL',
    direction: 'Long',
    setupType: 'breakout',
    openedAt: new Date('2026-01-06T10:00:00Z'),   // Tuesday
    closedAt: new Date('2026-01-06T14:00:00Z'),   // Tuesday, 4h later
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
    // openedAt 10:00 UTC, closedAt 14:00 UTC → exactly 4 hours
    const result = holdTimeVsR([makeTrade()])
    expect(result).toHaveLength(1)
    expect(result[0].holdHours).toBeCloseTo(4)
    expect(result[0].actualR).toBe(1.5)
    expect(result[0].ticker).toBe('AAPL')
    expect(result[0].result).toBe('Win')
  })

  it('holdHours is never negative (closedAt before openedAt → 0)', () => {
    const t = makeTrade({
      openedAt: new Date('2026-01-06T14:00:00Z'),
      closedAt: new Date('2026-01-06T10:00:00Z'),
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
      openedAt: new Date('2026-01-06T10:00:00Z'),
      closedAt: new Date('2026-01-08T10:00:00Z'), // 2 days later
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
    // 2026-01-06 is Tuesday
    const t = makeTrade({
      closedAt: new Date('2026-01-06T14:00:00Z'),
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
      makeTrade({ closedAt: new Date('2026-01-06T10:00:00Z'), realizedPnl: 100 }),
      makeTrade({ closedAt: new Date('2026-01-06T14:00:00Z'), realizedPnl: 200 }),
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
    // closedAt 14:00 UTC → hour 14
    const result = pnlByHour([makeTrade()])
    expect(result).toHaveLength(1)
    expect(result[0].hour).toBe(14)
    expect(result[0].totalPnl).toBeCloseTo(300)
    expect(result[0].tradeCount).toBe(1)
  })

  it('two trades same hour → accumulated', () => {
    const trades = [
      makeTrade({ closedAt: new Date('2026-01-06T14:00:00Z'), realizedPnl: 100 }),
      makeTrade({ closedAt: new Date('2026-01-06T14:30:00Z'), realizedPnl: 200 }),
    ]
    const result = pnlByHour(trades)
    expect(result).toHaveLength(1)
    expect(result[0].hour).toBe(14)
    expect(result[0].totalPnl).toBeCloseTo(300)
    expect(result[0].tradeCount).toBe(2)
  })

  it('trades at different hours → sorted ascending by hour', () => {
    const trades = [
      makeTrade({ closedAt: new Date('2026-01-06T15:00:00Z'), realizedPnl: 50 }),
      makeTrade({ closedAt: new Date('2026-01-06T09:00:00Z'), realizedPnl: 100 }),
      makeTrade({ closedAt: new Date('2026-01-06T12:00:00Z'), realizedPnl: -20 }),
    ]
    const result = pnlByHour(trades)
    expect(result.map(r => r.hour)).toEqual([9, 12, 15])
  })

  it('null realizedPnl → skipped', () => {
    const trades = [
      makeTrade({ realizedPnl: null as unknown as number, closedAt: new Date('2026-01-06T14:00:00Z') }),
      makeTrade({ realizedPnl: 100, closedAt: new Date('2026-01-06T15:00:00Z') }),
    ]
    const result = pnlByHour(trades)
    expect(result).toHaveLength(1)
    expect(result[0].hour).toBe(15)
  })

  it('pre/post-market hours are not filtered out', () => {
    const trades = [
      makeTrade({ closedAt: new Date('2026-01-06T04:00:00Z'), realizedPnl: 50 }),   // 4am
      makeTrade({ closedAt: new Date('2026-01-06T21:00:00Z'), realizedPnl: -30 }), // 9pm
    ]
    const result = pnlByHour(trades)
    const hours = result.map(r => r.hour)
    expect(hours).toContain(4)
    expect(hours).toContain(21)
  })
})
