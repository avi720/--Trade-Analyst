import { describe, it, expect } from 'vitest'
import { finalizeLegs } from '@/lib/trade/ai-import/finalize-legs'

const baseLeg = {
  ticker: 'AAPL',
  date: '2026-01-15',
  time: '09:30',
  side: 'BUY' as const,
  quantity: 100,
  price: 150,
  commission: 1,
  currency: 'USD',
}

describe('finalizeLegs', () => {
  it('injects the caller timezone onto every leg', () => {
    const { legs, errors } = finalizeLegs([{ ...baseLeg }], 'America/New_York')
    expect(errors).toEqual([])
    expect(legs).toHaveLength(1)
    expect(legs[0].timezone).toBe('America/New_York')
  })

  it('never lets AI output influence the timezone', () => {
    // Even if a rogue timezone slipped into the raw leg, the hard value wins.
    const { legs } = finalizeLegs([{ ...baseLeg, timezone: 'Pacific/Kiritimati' }], 'UTC')
    expect(legs[0].timezone).toBe('UTC')
  })

  it('drops null/undefined optional fields instead of failing', () => {
    const { legs, errors } = finalizeLegs(
      [{ ...baseLeg, orderType: null, broker: undefined, notes: null }],
      'UTC',
    )
    expect(errors).toEqual([])
    expect(legs[0].orderType).toBeUndefined()
    expect(legs[0].notes).toBeUndefined()
  })

  it('sanitizes an unknown broker but keeps the trade', () => {
    const { legs, errors } = finalizeLegs([{ ...baseLeg, broker: 'Robinhood' }], 'UTC')
    expect(errors).toEqual([])
    expect(legs).toHaveLength(1)
    expect(legs[0].broker).toBeUndefined()
  })

  it('keeps a valid broker', () => {
    const { legs } = finalizeLegs([{ ...baseLeg, broker: 'IBKR' }], 'UTC')
    expect(legs[0].broker).toBe('IBKR')
  })

  it('drops an invalid setupType/emotionalState rather than dropping the leg', () => {
    const { legs, errors } = finalizeLegs(
      [{ ...baseLeg, setupType: 'totally made up', emotionalState: 'x'.repeat(50) }],
      'UTC',
    )
    expect(errors).toEqual([])
    expect(legs).toHaveLength(1)
    expect(legs[0].setupType).toBeUndefined()
    expect(legs[0].emotionalState).toBeUndefined()
  })

  it('reports structural validation errors by index', () => {
    const { legs, errors } = finalizeLegs(
      [{ ...baseLeg }, { ...baseLeg, quantity: -5 }, { ...baseLeg, ticker: '' }],
      'UTC',
    )
    expect(legs).toHaveLength(1)
    expect(errors).toHaveLength(2)
    expect(errors.map((e) => e.rowIndex).sort()).toEqual([1, 2])
  })
})
