import { describe, it, expect } from 'vitest'
import {
  unrealizedPnl,
  unrealizedPct,
  currentR,
  exposure,
  type OpenPositionTrade,
} from '@/lib/utils/position-calc'

function trade(overrides: Partial<OpenPositionTrade>): OpenPositionTrade {
  return {
    direction: 'Long',
    avgEntryPrice: 100,
    totalQuantity: 10,
    stopPrice: 90,
    lastKnownPrice: 110,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// unrealizedPnl
// ---------------------------------------------------------------------------
describe('unrealizedPnl', () => {
  it('long profit', () => {
    expect(unrealizedPnl(trade({ lastKnownPrice: 110 }))).toBeCloseTo(100) // (110-100)*10
  })

  it('long loss', () => {
    expect(unrealizedPnl(trade({ lastKnownPrice: 90 }))).toBeCloseTo(-100) // (90-100)*10
  })

  it('short profit (price falls)', () => {
    expect(unrealizedPnl(trade({ direction: 'Short', avgEntryPrice: 100, lastKnownPrice: 80 }))).toBeCloseTo(200) // (100-80)*10
  })

  it('short loss (price rises)', () => {
    expect(unrealizedPnl(trade({ direction: 'Short', avgEntryPrice: 100, lastKnownPrice: 120 }))).toBeCloseTo(-200) // (100-120)*10
  })

  it('returns null when lastKnownPrice is null', () => {
    expect(unrealizedPnl(trade({ lastKnownPrice: null }))).toBeNull()
  })

  it('returns null when lastKnownPrice is undefined', () => {
    // @ts-expect-error testing runtime undefined
    expect(unrealizedPnl(trade({ lastKnownPrice: undefined }))).toBeNull()
  })

  it('breakeven (price equals entry)', () => {
    expect(unrealizedPnl(trade({ lastKnownPrice: 100 }))).toBeCloseTo(0)
  })
})

// ---------------------------------------------------------------------------
// unrealizedPct
// ---------------------------------------------------------------------------
describe('unrealizedPct', () => {
  it('long +10% gain', () => {
    expect(unrealizedPct(trade({ lastKnownPrice: 110 }))).toBeCloseTo(10) // (100/1000)*100
  })

  it('long -10% loss', () => {
    expect(unrealizedPct(trade({ lastKnownPrice: 90 }))).toBeCloseTo(-10)
  })

  it('short profit percentage', () => {
    expect(unrealizedPct(trade({ direction: 'Short', avgEntryPrice: 100, lastKnownPrice: 80 }))).toBeCloseTo(20)
  })

  it('returns null when price unavailable', () => {
    expect(unrealizedPct(trade({ lastKnownPrice: null }))).toBeNull()
  })

  it('returns null when avgEntryPrice is zero (division guard)', () => {
    expect(unrealizedPct(trade({ avgEntryPrice: 0, lastKnownPrice: 10 }))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// currentR
// ---------------------------------------------------------------------------
describe('currentR', () => {
  it('long at +1R (price moved exactly 1 risk unit above entry)', () => {
    // entry=100, stop=90, risk=10 per share. price=110 → pnl=10 → R=1
    expect(currentR(trade({ avgEntryPrice: 100, stopPrice: 90, lastKnownPrice: 110 }))).toBeCloseTo(1)
  })

  it('long at -0.5R (partial loss)', () => {
    // risk=10, price=95 → pnl=-5 → R=-0.5
    expect(currentR(trade({ avgEntryPrice: 100, stopPrice: 90, lastKnownPrice: 95 }))).toBeCloseTo(-0.5)
  })

  it('long at +2R', () => {
    expect(currentR(trade({ avgEntryPrice: 100, stopPrice: 90, lastKnownPrice: 120 }))).toBeCloseTo(2)
  })

  it('short at +1R (price falls 1 risk unit from entry)', () => {
    // entry=100, stop=110, risk=10. price=90 → pnl/share=10 → R=1
    expect(currentR(trade({ direction: 'Short', avgEntryPrice: 100, stopPrice: 110, lastKnownPrice: 90 }))).toBeCloseTo(1)
  })

  it('short loss', () => {
    // entry=100, stop=110, risk=10. price=105 → pnl/share=-5 → R=-0.5
    expect(currentR(trade({ direction: 'Short', avgEntryPrice: 100, stopPrice: 110, lastKnownPrice: 105 }))).toBeCloseTo(-0.5)
  })

  it('returns null when no lastKnownPrice', () => {
    expect(currentR(trade({ lastKnownPrice: null }))).toBeNull()
  })

  it('returns null when no stopPrice', () => {
    expect(currentR(trade({ stopPrice: null }))).toBeNull()
  })

  it('returns null when riskPerShare is near zero (prevents divide-by-zero)', () => {
    // entry and stop are the same
    expect(currentR(trade({ avgEntryPrice: 100, stopPrice: 100, lastKnownPrice: 110 }))).toBeNull()
  })

  it('returns null when long stop is above entry (invalid setup — risk would be negative)', () => {
    // stop=110 > entry=100 for a Long → riskPerShare = -10 < 0.0001 → null
    expect(currentR(trade({ avgEntryPrice: 100, stopPrice: 110, lastKnownPrice: 110 }))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// exposure
// ---------------------------------------------------------------------------
describe('exposure', () => {
  it('long exposure', () => {
    expect(exposure({ avgEntryPrice: 100, totalQuantity: 10 })).toBeCloseTo(1000)
  })

  it('short exposure (always positive)', () => {
    expect(exposure({ avgEntryPrice: 50, totalQuantity: 20 })).toBeCloseTo(1000)
  })

  it('fractional quantity', () => {
    expect(exposure({ avgEntryPrice: 100.5, totalQuantity: 3 })).toBeCloseTo(301.5)
  })
})
