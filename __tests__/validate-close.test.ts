import { describe, it, expect } from 'vitest'
import {
  validateCloseShape,
  validateCloseAgainstTrade,
  modifiedStopNote,
  type ClosePayloadShape,
} from '@/lib/trade/validate-close'

// Minimal valid payload — individual tests mutate fields to exercise each guard.
const basePayload: ClosePayloadShape = {
  closePrice: 152.5,
  closeDate: '2026-05-01',
  closeTime: '15:30',
  closeReason: 'other',
}

describe('validateCloseShape', () => {
  it('accepts a well-formed payload', () => {
    expect(validateCloseShape(basePayload)).toBeNull()
  })

  it('rejects zero closePrice', () => {
    const r = validateCloseShape({ ...basePayload, closePrice: 0 })
    expect(r).not.toBeNull()
    expect(r!.message).toMatch(/closePrice/)
    expect(r!.status).toBe(422)
  })

  it('rejects negative closePrice', () => {
    expect(validateCloseShape({ ...basePayload, closePrice: -1 })?.message).toMatch(/closePrice/)
  })

  it('rejects NaN closePrice', () => {
    expect(validateCloseShape({ ...basePayload, closePrice: Number.NaN })?.message).toMatch(/closePrice/)
  })

  it('rejects malformed closeDate', () => {
    expect(validateCloseShape({ ...basePayload, closeDate: '01-05-2026' })?.message).toMatch(/closeDate/)
    expect(validateCloseShape({ ...basePayload, closeDate: '2026/05/01' })?.message).toMatch(/closeDate/)
    expect(validateCloseShape({ ...basePayload, closeDate: '2026-5-1' })?.message).toMatch(/closeDate/)
  })

  it('rejects malformed closeTime', () => {
    expect(validateCloseShape({ ...basePayload, closeTime: '15-30' })?.message).toMatch(/closeTime/)
    expect(validateCloseShape({ ...basePayload, closeTime: '3:30' })?.message).toMatch(/closeTime/)
    expect(validateCloseShape({ ...basePayload, closeTime: '15:3' })?.message).toMatch(/closeTime/)
  })

  it('rejects unknown closeReason', () => {
    const r = validateCloseShape({
      ...basePayload,
      closeReason: 'HOLD' as unknown as ClosePayloadShape['closeReason'],
    })
    expect(r?.message).toMatch(/Invalid closeReason/)
  })

  it('modified_stop without modifiedStopPrice → rejected', () => {
    const r = validateCloseShape({ ...basePayload, closeReason: 'modified_stop' })
    expect(r?.message).toMatch(/modifiedStopPrice/)
  })

  it('modified_stop with zero modifiedStopPrice → rejected', () => {
    const r = validateCloseShape({
      ...basePayload,
      closeReason: 'modified_stop',
      modifiedStopPrice: 0,
    })
    expect(r?.message).toMatch(/modifiedStopPrice/)
  })

  it('modified_stop with positive modifiedStopPrice → accepted', () => {
    expect(
      validateCloseShape({
        ...basePayload,
        closeReason: 'modified_stop',
        modifiedStopPrice: 148,
      }),
    ).toBeNull()
  })

  it('shape-phase ignores cross-field guards (original_stop without stopPrice is fine here)', () => {
    // Cross-field checks live in validateCloseAgainstTrade. Shape phase passes
    // original_stop / target without context.
    expect(validateCloseShape({ ...basePayload, closeReason: 'original_stop' })).toBeNull()
    expect(validateCloseShape({ ...basePayload, closeReason: 'target' })).toBeNull()
  })
})

describe('validateCloseAgainstTrade', () => {
  it('original_stop with stopPrice on the trade → accepted', () => {
    const r = validateCloseAgainstTrade(
      { ...basePayload, closeReason: 'original_stop' },
      { stopPrice: 145, targetPrice: null },
    )
    expect(r).toBeNull()
  })

  it('original_stop without stopPrice → rejected', () => {
    const r = validateCloseAgainstTrade(
      { ...basePayload, closeReason: 'original_stop' },
      { stopPrice: null, targetPrice: null },
    )
    expect(r?.message).toMatch(/original_stop requires/)
    expect(r?.status).toBe(422)
  })

  it('target with targetPrice → accepted', () => {
    expect(
      validateCloseAgainstTrade(
        { ...basePayload, closeReason: 'target' },
        { stopPrice: 145, targetPrice: 170 },
      ),
    ).toBeNull()
  })

  it('target without targetPrice → rejected', () => {
    const r = validateCloseAgainstTrade(
      { ...basePayload, closeReason: 'target' },
      { stopPrice: 145, targetPrice: null },
    )
    expect(r?.message).toMatch(/target requires/)
  })

  it('other / modified_stop are not gated by trade context', () => {
    expect(
      validateCloseAgainstTrade(
        { ...basePayload, closeReason: 'other' },
        { stopPrice: null, targetPrice: null },
      ),
    ).toBeNull()
    expect(
      validateCloseAgainstTrade(
        { ...basePayload, closeReason: 'modified_stop', modifiedStopPrice: 148 },
        { stopPrice: null, targetPrice: null },
      ),
    ).toBeNull()
  })

  it('NaN stopPrice is treated as missing for original_stop', () => {
    const r = validateCloseAgainstTrade(
      { ...basePayload, closeReason: 'original_stop' },
      { stopPrice: Number.NaN, targetPrice: null },
    )
    expect(r?.message).toMatch(/original_stop requires/)
  })
})

describe('modifiedStopNote', () => {
  it('produces the canonical Hebrew label expected by both close routes', () => {
    expect(modifiedStopNote(148)).toBe('סטופ שונה: 148')
    expect(modifiedStopNote(150.5)).toBe('סטופ שונה: 150.5')
  })
})
