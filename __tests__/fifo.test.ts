import { describe, it, expect } from 'vitest'
import { matchExecution } from '@/lib/trade/fifo'
import type { NormalizedExecution, OpenTradeSnapshot } from '@/types/trade'

const NOW = new Date('2026-04-23T14:30:00Z')

function exec(overrides: Partial<NormalizedExecution> & { side: NormalizedExecution['side'] }): NormalizedExecution {
  return {
    brokerExecId: 'EXEC-001',
    ticker: 'AAPL',
    quantity: 100,
    price: 150,
    commission: 1,
    executedAt: NOW,
    rawPayload: {},
    ...overrides,
  }
}

function openLong(overrides: Partial<OpenTradeSnapshot> = {}): OpenTradeSnapshot {
  return {
    id: 'trade-1',
    direction: 'Long',
    avgEntryPrice: 140,
    totalQuantity: 100,
    totalQuantityOpened: 100,
    totalCommission: 1,
    realizedPnl: 0,
    openedAt: new Date('2026-04-22T09:30:00Z'),
    stopPrice: 130,
    ...overrides,
  }
}

function openShort(overrides: Partial<OpenTradeSnapshot> = {}): OpenTradeSnapshot {
  return {
    id: 'trade-2',
    direction: 'Short',
    avgEntryPrice: 160,
    totalQuantity: 100,
    totalQuantityOpened: 100,
    totalCommission: 1,
    realizedPnl: 0,
    openedAt: new Date('2026-04-22T09:30:00Z'),
    stopPrice: 170,
    ...overrides,
  }
}

// ─── OPEN ──────────────────────────────────────────────────────────────────

describe('OPEN new position', () => {
  it('BUY with no open trade → OPEN Long', () => {
    const result = matchExecution(exec({ side: 'BUY' }), null)
    expect(result.type).toBe('OPEN')
    if (result.type !== 'OPEN') return
    expect(result.tradeCreate.direction).toBe('Long')
    expect(result.tradeCreate.status).toBe('Open')
    expect(result.tradeCreate.avgEntryPrice).toBe(150)
    expect(result.tradeCreate.totalQuantity).toBe(100)
    expect(result.tradeCreate.totalCommission).toBe(1)
    expect(result.orderCreate.side).toBe('BUY')
  })

  it('SELL with no open trade → OPEN Short', () => {
    const result = matchExecution(exec({ side: 'SELL', price: 160 }), null)
    expect(result.type).toBe('OPEN')
    if (result.type !== 'OPEN') return
    expect(result.tradeCreate.direction).toBe('Short')
  })

  it('SSHORT with no open trade → OPEN Short', () => {
    const result = matchExecution(exec({ side: 'SSHORT', price: 160 }), null)
    expect(result.type).toBe('OPEN')
    if (result.type !== 'OPEN') return
    expect(result.tradeCreate.direction).toBe('Short')
    // normalized side stored as SELL
    expect(result.orderCreate.side).toBe('SELL')
  })
})

// ─── LONG TRADES ──────────────────────────────────────────────────────────

describe('Long trade', () => {
  it('scale in: BUY 50 more → SCALE_IN, avgEntry recalculated', () => {
    const trade = openLong({ avgEntryPrice: 140, totalQuantity: 100 })
    const result = matchExecution(exec({ side: 'BUY', quantity: 50, price: 160, brokerExecId: 'EXEC-002' }), trade)
    expect(result.type).toBe('SCALE_IN')
    if (result.type !== 'SCALE_IN') return
    // newAvg = (140*100 + 160*50) / 150 = 146.67
    expect(result.tradeUpdate.avgEntryPrice).toBeCloseTo((140 * 100 + 160 * 50) / 150, 6)
    expect(result.tradeUpdate.totalQuantity).toBe(150)
    expect(result.tradeUpdate.totalQuantityOpened).toBe(150)
  })

  it('partial reduce: SELL 50 of 100 → REDUCE, pnl for 50 shares', () => {
    const trade = openLong({ avgEntryPrice: 140 })
    // sell 50 at 150 → pnl = (150-140)*50 - 1 = 499
    const result = matchExecution(exec({ side: 'SELL', quantity: 50, price: 150, commission: 1, brokerExecId: 'EXEC-002' }), trade)
    expect(result.type).toBe('REDUCE')
    if (result.type !== 'REDUCE') return
    expect(result.tradeUpdate.totalQuantity).toBe(50)
    expect(result.tradeUpdate.realizedPnl).toBeCloseTo(499, 6)
    expect(result.tradeUpdate.totalCommission).toBeCloseTo(2, 6)
  })

  it('full close: SELL 100 of 100 → CLOSE, actualR set', () => {
    const trade = openLong({ avgEntryPrice: 140, stopPrice: 130 })
    // sell 100 at 150 → pnl = (150-140)*100 - 1 = 999, risk/share=10, totalQtyOpened=100
    // actualR = 999 / (10*100) = 0.999
    const result = matchExecution(exec({ side: 'SELL', quantity: 100, price: 150, commission: 1 }), trade)
    expect(result.type).toBe('CLOSE')
    if (result.type !== 'CLOSE') return
    expect(result.tradeUpdate.status).toBe('Closed')
    expect(result.tradeUpdate.totalQuantity).toBe(0)
    expect(result.tradeUpdate.realizedPnl).toBeCloseTo(999, 6)
    expect(result.tradeUpdate.actualR).toBeCloseTo(999 / (10 * 100), 6)
    expect(result.tradeUpdate.result).toBe('Win')
  })

  it('full close with stopPrice=null → actualR is null', () => {
    const trade = openLong({ avgEntryPrice: 140, stopPrice: null })
    const result = matchExecution(exec({ side: 'SELL', quantity: 100, price: 150, commission: 1 }), trade)
    expect(result.type).toBe('CLOSE')
    if (result.type !== 'CLOSE') return
    expect(result.tradeUpdate.actualR).toBeNull()
  })

  it('full close at a loss → result=Loss', () => {
    const trade = openLong({ avgEntryPrice: 140, stopPrice: 130 })
    // sell at 135 → pnl = (135-140)*100 - 1 = -501
    const result = matchExecution(exec({ side: 'SELL', quantity: 100, price: 135, commission: 1 }), trade)
    expect(result.type).toBe('CLOSE')
    if (result.type !== 'CLOSE') return
    expect(result.tradeUpdate.result).toBe('Loss')
    expect(result.tradeUpdate.realizedPnl).toBeCloseTo(-501, 6)
  })

  it('zero commission close works correctly', () => {
    const trade = openLong({ avgEntryPrice: 100, totalQuantity: 100, totalQuantityOpened: 100, totalCommission: 0, realizedPnl: 0, stopPrice: 90 })
    const result = matchExecution(exec({ side: 'SELL', quantity: 100, price: 120, commission: 0 }), trade)
    expect(result.type).toBe('CLOSE')
    if (result.type !== 'CLOSE') return
    expect(result.tradeUpdate.realizedPnl).toBeCloseTo(2000, 6)
    expect(result.tradeUpdate.actualR).toBeCloseTo(2000 / (10 * 100), 6)
  })
})

// ─── SHORT TRADES ─────────────────────────────────────────────────────────

describe('Short trade', () => {
  it('SSHORT on open short → SCALE_IN', () => {
    const trade = openShort({ avgEntryPrice: 160, totalQuantity: 100 })
    const result = matchExecution(exec({ side: 'SSHORT', quantity: 50, price: 155, brokerExecId: 'EXEC-002' }), trade)
    expect(result.type).toBe('SCALE_IN')
    if (result.type !== 'SCALE_IN') return
    const expectedAvg = (160 * 100 + 155 * 50) / 150
    expect(result.tradeUpdate.avgEntryPrice).toBeCloseTo(expectedAvg, 6)
  })

  it('partial cover: BUY 50 of 100 short → REDUCE', () => {
    const trade = openShort({ avgEntryPrice: 160 })
    // cover 50 at 150 → pnl = (160-150)*50 - 1 = 499
    const result = matchExecution(exec({ side: 'BUY', quantity: 50, price: 150, commission: 1, brokerExecId: 'EXEC-002' }), trade)
    expect(result.type).toBe('REDUCE')
    if (result.type !== 'REDUCE') return
    expect(result.tradeUpdate.totalQuantity).toBe(50)
    expect(result.tradeUpdate.realizedPnl).toBeCloseTo(499, 6)
  })

  it('full cover: BUY 100 of 100 short → CLOSE with correct pnl', () => {
    const trade = openShort({ avgEntryPrice: 160, stopPrice: 170 })
    // pnl = (160-150)*100 - 1 = 999, risk/share=10
    const result = matchExecution(exec({ side: 'BUY', quantity: 100, price: 150, commission: 1 }), trade)
    expect(result.type).toBe('CLOSE')
    if (result.type !== 'CLOSE') return
    expect(result.tradeUpdate.status).toBe('Closed')
    expect(result.tradeUpdate.realizedPnl).toBeCloseTo(999, 6)
    expect(result.tradeUpdate.actualR).toBeCloseTo(999 / (10 * 100), 6)
    expect(result.tradeUpdate.result).toBe('Win')
  })

  it('cover at a loss (price went up) → result=Loss', () => {
    const trade = openShort({ avgEntryPrice: 160, stopPrice: 170 })
    // pnl = (160-175)*100 - 1 = -1501
    const result = matchExecution(exec({ side: 'BUY', quantity: 100, price: 175, commission: 1 }), trade)
    expect(result.type).toBe('CLOSE')
    if (result.type !== 'CLOSE') return
    expect(result.tradeUpdate.result).toBe('Loss')
  })
})

// ─── REVERSAL ──────────────────────────────────────────────────────────────

describe('Reversal', () => {
  it('long→short: SELL 200 on 100 long → close 100 + open 100 short', () => {
    const trade = openLong({ avgEntryPrice: 140, totalQuantity: 100 })
    const result = matchExecution(exec({ side: 'SELL', quantity: 200, price: 150, commission: 2 }), trade)
    expect(result.type).toBe('REVERSAL')
    if (result.type !== 'REVERSAL') return

    expect(result.close.tradeUpdate.status).toBe('Closed')
    expect(result.close.orderCreate.quantity).toBe(100)  // closing 100 shares
    expect(result.close.orderCreate.commission).toBeCloseTo(1, 6)  // half commission

    expect(result.open.tradeCreate.direction).toBe('Short')
    expect(result.open.tradeCreate.totalQuantity).toBe(100)
    expect(result.open.orderCreate.commission).toBeCloseTo(1, 6)
  })

  it('short→long: BUY 200 on 100 short → close 100 + open 100 long', () => {
    const trade = openShort({ avgEntryPrice: 160, totalQuantity: 100 })
    const result = matchExecution(exec({ side: 'BUY', quantity: 200, price: 150, commission: 2 }), trade)
    expect(result.type).toBe('REVERSAL')
    if (result.type !== 'REVERSAL') return

    expect(result.close.tradeUpdate.status).toBe('Closed')
    expect(result.open.tradeCreate.direction).toBe('Long')
    expect(result.open.tradeCreate.totalQuantity).toBe(100)
  })

  it('commission split proportionally (3:1 ratio)', () => {
    const trade = openLong({ totalQuantity: 75 })
    // sell 100: 75 to close, 25 to open new short. Commission = 4.
    const result = matchExecution(exec({ side: 'SELL', quantity: 100, price: 150, commission: 4 }), trade)
    expect(result.type).toBe('REVERSAL')
    if (result.type !== 'REVERSAL') return
    expect(result.close.orderCreate.commission).toBeCloseTo(3, 6)  // 4 * 75/100
    expect(result.open.orderCreate.commission).toBeCloseTo(1, 6)   // 4 * 25/100
  })
})

// ─── PARTIAL FILLS ─────────────────────────────────────────────────────────

describe('Partial fills', () => {
  it('3 fills with same brokerOrderId: OPEN then 2x SCALE_IN', () => {
    const orderId = 'ORDER-001'

    // Fill 1: open
    const r1 = matchExecution(exec({ side: 'BUY', quantity: 50, price: 140, brokerExecId: 'E1', brokerOrderId: orderId }), null)
    expect(r1.type).toBe('OPEN')
    if (r1.type !== 'OPEN') return

    // Fill 2: scale in
    const snap1: OpenTradeSnapshot = {
      id: 'trade-1', direction: 'Long', avgEntryPrice: 140, totalQuantity: 50,
      totalQuantityOpened: 50, totalCommission: 1, realizedPnl: 0, openedAt: NOW, stopPrice: null,
    }
    const r2 = matchExecution(exec({ side: 'BUY', quantity: 50, price: 145, brokerExecId: 'E2', brokerOrderId: orderId }), snap1)
    expect(r2.type).toBe('SCALE_IN')
    if (r2.type !== 'SCALE_IN') return
    expect(r2.tradeUpdate.avgEntryPrice).toBeCloseTo((140 * 50 + 145 * 50) / 100, 6)

    // Fill 3: scale in again
    const snap2: OpenTradeSnapshot = {
      id: 'trade-1', direction: 'Long',
      avgEntryPrice: r2.tradeUpdate.avgEntryPrice!,
      totalQuantity: 100, totalQuantityOpened: 100, totalCommission: 2, realizedPnl: 0, openedAt: NOW, stopPrice: null,
    }
    const r3 = matchExecution(exec({ side: 'BUY', quantity: 50, price: 150, brokerExecId: 'E3', brokerOrderId: orderId }), snap2)
    expect(r3.type).toBe('SCALE_IN')
    if (r3.type !== 'SCALE_IN') return
    const expectedFinalAvg = (snap2.avgEntryPrice * 100 + 150 * 50) / 150
    expect(r3.tradeUpdate.avgEntryPrice).toBeCloseTo(expectedFinalAvg, 6)
    expect(r3.tradeUpdate.totalQuantity).toBe(150)
  })
})

// ─── COMMISSION ACCUMULATION ────────────────────────────────────────────────

describe('Commission', () => {
  it('commission accumulated across scale-ins', () => {
    const trade = openLong({ totalCommission: 1, totalQuantity: 100, totalQuantityOpened: 100 })
    const result = matchExecution(exec({ side: 'BUY', quantity: 50, price: 145, commission: 1.5, brokerExecId: 'EXEC-002' }), trade)
    expect(result.type).toBe('SCALE_IN')
    if (result.type !== 'SCALE_IN') return
    expect(result.tradeUpdate.totalCommission).toBeCloseTo(2.5, 6)
  })

  it('commission deducted from pnl on close', () => {
    const trade = openLong({ avgEntryPrice: 100, totalQuantity: 100, totalQuantityOpened: 100, totalCommission: 0, realizedPnl: 0, stopPrice: null })
    // sell at 110 → gross pnl = 1000, minus commission 2 = 998
    const result = matchExecution(exec({ side: 'SELL', quantity: 100, price: 110, commission: 2 }), trade)
    expect(result.type).toBe('CLOSE')
    if (result.type !== 'CLOSE') return
    expect(result.tradeUpdate.realizedPnl).toBeCloseTo(998, 6)
  })
})

// ─── EDGE CASES ────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('same-day round trip: BUY then SELL same day', () => {
    const r1 = matchExecution(exec({ side: 'BUY', price: 100, quantity: 100, commission: 1, brokerExecId: 'E1' }), null)
    expect(r1.type).toBe('OPEN')
    if (r1.type !== 'OPEN') return

    const snap: OpenTradeSnapshot = {
      id: 'T1', direction: 'Long', avgEntryPrice: 100, totalQuantity: 100,
      totalQuantityOpened: 100, totalCommission: 1, realizedPnl: 0, openedAt: NOW, stopPrice: null,
    }
    const r2 = matchExecution(exec({ side: 'SELL', price: 105, quantity: 100, commission: 1, brokerExecId: 'E2' }), snap)
    expect(r2.type).toBe('CLOSE')
    if (r2.type !== 'CLOSE') return
    // pnl = (105-100)*100 - commission_this_exec(1) = 499
    expect(r2.tradeUpdate.realizedPnl).toBeCloseTo(499, 6)
  })

  it('riskPerShare < 0.0001 → actualR is null', () => {
    const trade = openLong({ avgEntryPrice: 100, stopPrice: 100 + 0.00001, totalQuantity: 100, totalQuantityOpened: 100, realizedPnl: 0, totalCommission: 0 })
    const result = matchExecution(exec({ side: 'SELL', quantity: 100, price: 110, commission: 0 }), trade)
    expect(result.type).toBe('CLOSE')
    if (result.type !== 'CLOSE') return
    expect(result.tradeUpdate.actualR).toBeNull()
  })

  it('fractional quantities work correctly', () => {
    const result = matchExecution(exec({ side: 'BUY', quantity: 0.5, price: 200, commission: 0.5 }), null)
    expect(result.type).toBe('OPEN')
    if (result.type !== 'OPEN') return
    expect(result.tradeCreate.totalQuantity).toBe(0.5)
  })
})
