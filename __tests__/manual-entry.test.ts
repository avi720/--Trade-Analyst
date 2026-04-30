import { describe, it, expect } from 'vitest'
import { validateLeg, buildExecution, buildExecutions } from '@/lib/trade/manual-entry'
import type { ManualLeg } from '@/lib/trade/manual-entry'

const validLeg: ManualLeg = {
  ticker: 'AAPL',
  date: '2026-01-15',
  time: '09:30',
  side: 'BUY',
  quantity: 100,
  price: 150.00,
  commission: 1.00,
  currency: 'USD',
}

describe('validateLeg', () => {
  it('passes for a valid leg', () => {
    expect(validateLeg(validLeg, 0)).toHaveLength(0)
  })

  it('errors when ticker is empty', () => {
    const errors = validateLeg({ ...validLeg, ticker: '' }, 0)
    expect(errors.some(e => e.field.includes('ticker'))).toBe(true)
  })

  it('errors when date format is wrong', () => {
    const errors = validateLeg({ ...validLeg, date: '15/01/2026' }, 0)
    expect(errors.some(e => e.field.includes('date'))).toBe(true)
  })

  it('errors when time format is wrong', () => {
    const errors = validateLeg({ ...validLeg, time: '9:30am' }, 0)
    expect(errors.some(e => e.field.includes('time'))).toBe(true)
  })

  it('errors when side is invalid', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateLeg({ ...validLeg, side: 'HOLD' as any }, 0)
    expect(errors.some(e => e.field.includes('side'))).toBe(true)
  })

  it('errors when quantity is zero', () => {
    const errors = validateLeg({ ...validLeg, quantity: 0 }, 0)
    expect(errors.some(e => e.field.includes('quantity'))).toBe(true)
  })

  it('errors when quantity is negative', () => {
    const errors = validateLeg({ ...validLeg, quantity: -10 }, 0)
    expect(errors.some(e => e.field.includes('quantity'))).toBe(true)
  })

  it('errors when price is zero', () => {
    const errors = validateLeg({ ...validLeg, price: 0 }, 0)
    expect(errors.some(e => e.field.includes('price'))).toBe(true)
  })

  it('errors when commission is negative', () => {
    const errors = validateLeg({ ...validLeg, commission: -1 }, 0)
    expect(errors.some(e => e.field.includes('commission'))).toBe(true)
  })

  it('allows zero commission', () => {
    const errors = validateLeg({ ...validLeg, commission: 0 }, 0)
    expect(errors).toHaveLength(0)
  })

  it('errors when currency is empty', () => {
    const errors = validateLeg({ ...validLeg, currency: '' }, 0)
    expect(errors.some(e => e.field.includes('currency'))).toBe(true)
  })
})

describe('buildExecution', () => {
  it('returns correct NormalizedExecution fields', () => {
    const exec = buildExecution(validLeg, 0)
    expect(exec.ticker).toBe('AAPL')
    expect(exec.side).toBe('BUY')
    expect(exec.quantity).toBe(100)
    expect(exec.price).toBe(150.00)
    expect(exec.commission).toBe(1.00)
    expect(exec.currency).toBe('USD')
    expect(exec.assetClass).toBe('STK')
    expect(exec.rawPayload).toEqual({})
  })

  it('normalizes ticker to uppercase', () => {
    const exec = buildExecution({ ...validLeg, ticker: 'aapl' }, 0)
    expect(exec.ticker).toBe('AAPL')
  })

  it('normalizes currency to uppercase', () => {
    const exec = buildExecution({ ...validLeg, currency: 'usd' }, 0)
    expect(exec.currency).toBe('USD')
  })

  it('generates a deterministic brokerExecId with MANUAL prefix', () => {
    const exec = buildExecution(validLeg, 2)
    expect(exec.brokerExecId).toMatch(/^MANUAL-AAPL-\d+-2$/)
  })

  it('different indexes produce different IDs', () => {
    const e0 = buildExecution(validLeg, 0)
    const e1 = buildExecution(validLeg, 1)
    expect(e0.brokerExecId).not.toBe(e1.brokerExecId)
  })

  it('executedAt is a valid Date in UTC', () => {
    const exec = buildExecution(validLeg, 0)
    expect(exec.executedAt).toBeInstanceOf(Date)
    expect(exec.executedAt.toISOString()).toContain('2026-01-15')
  })
})

describe('buildExecutions', () => {
  it('returns executions for valid legs', () => {
    const { executions, errors } = buildExecutions([validLeg, { ...validLeg, side: 'SELL' }])
    expect(errors).toHaveLength(0)
    expect(executions).toHaveLength(2)
  })

  it('returns errors for invalid legs, no executions', () => {
    const { executions, errors } = buildExecutions([{ ...validLeg, ticker: '' }])
    expect(errors.length).toBeGreaterThan(0)
    expect(executions).toHaveLength(0)
  })

  it('skips invalid legs and returns executions for valid ones', () => {
    const bad: ManualLeg = { ...validLeg, ticker: '' }
    const good: ManualLeg = { ...validLeg, ticker: 'MSFT', side: 'SELL' }
    const { executions, errors } = buildExecutions([bad, good])
    expect(errors.length).toBeGreaterThan(0)
    expect(executions).toHaveLength(1)
    expect(executions[0].ticker).toBe('MSFT')
  })
})
