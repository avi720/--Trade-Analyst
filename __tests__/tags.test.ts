import { describe, it, expect } from 'vitest'
import { normalizeTags, splitTagString, validateTags, TAG_MAX_COUNT, TAG_MAX_LEN } from '@/lib/constants/trade-options'
import { extractAnnotations, validateLeg, type ManualLeg } from '@/lib/trade/manual-entry'

function leg(over: Partial<ManualLeg> = {}): ManualLeg {
  return {
    ticker: 'AAPL', date: '2026-01-15', time: '09:30', side: 'BUY',
    quantity: 10, price: 100, commission: 1, currency: 'USD', ...over,
  }
}

describe('normalizeTags', () => {
  it('trims, collapses whitespace, drops empties, dedupes case-insensitively, keeps order', () => {
    expect(normalizeTags(['  Gap  ', 'gap', 'earn  ings', '', '   ', 'GAP', 'x'])).toEqual(['Gap', 'earn ings', 'x'])
  })
  it('handles null/undefined and non-strings', () => {
    expect(normalizeTags(null)).toEqual([])
    expect(normalizeTags(undefined)).toEqual([])
    expect(normalizeTags(['a', 5 as unknown as string])).toEqual(['a'])
  })
})

describe('splitTagString', () => {
  it('splits on comma, semicolon and pipe', () => {
    expect(normalizeTags(splitTagString('a, b;c | d'))).toEqual(['a', 'b', 'c', 'd'])
    expect(splitTagString(null)).toEqual([])
  })
})

describe('validateTags', () => {
  it('accepts up to the cap and rejects beyond it', () => {
    expect(validateTags(Array.from({ length: TAG_MAX_COUNT }, (_, i) => `t${i}`))).toBeNull()
    expect(validateTags(Array.from({ length: TAG_MAX_COUNT + 1 }, (_, i) => `t${i}`))).toMatch(/at most/)
  })
  it('rejects over-long and empty tags', () => {
    expect(validateTags(['x'.repeat(TAG_MAX_LEN)])).toBeNull()
    expect(validateTags(['x'.repeat(TAG_MAX_LEN + 1)])).toMatch(/over/)
    expect(validateTags([' '])).toMatch(/empty/)
  })
})

describe('ManualLeg tags', () => {
  it('extractAnnotations normalizes and omits empty lists', () => {
    expect(extractAnnotations(leg({ tags: [' a ', 'A', 'b'] })).tags).toEqual(['a', 'b'])
    expect('tags' in extractAnnotations(leg({ tags: ['', ' '] }))).toBe(false)
    expect('tags' in extractAnnotations(leg())).toBe(false)
  })
  it('validateLeg flags too many tags', () => {
    const errs = validateLeg(leg({ tags: Array.from({ length: TAG_MAX_COUNT + 1 }, (_, i) => `t${i}`) }), 0)
    expect(errs.some(e => e.field.endsWith('.tags'))).toBe(true)
    expect(validateLeg(leg({ tags: ['a', 'b'] }), 0).some(e => e.field.endsWith('.tags'))).toBe(false)
  })
})
