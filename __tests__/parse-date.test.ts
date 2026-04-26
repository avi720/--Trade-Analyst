import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseIbkrDate } from '@/lib/ibkr/parse-date'

afterEach(() => vi.restoreAllMocks())

function expectUtcComponents(date: Date, y: number, m: number, d: number, h: number, min: number, sec: number) {
  expect(date.getUTCFullYear()).toBe(y)
  expect(date.getUTCMonth() + 1).toBe(m)
  expect(date.getUTCDate()).toBe(d)
  expect(date.getUTCHours()).toBe(h)
  expect(date.getUTCMinutes()).toBe(min)
  expect(date.getUTCSeconds()).toBe(sec)
}

describe('parseIbkrDate', () => {
  describe('valid timezone abbreviations', () => {
    it('EST (UTC-5): 14:30:00 EST → 19:30:00 UTC', () => {
      const result = parseIbkrDate('23/04/2026;14:30:00 EST')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 4, 23, 19, 30, 0)
    })

    it('EDT (UTC-4): 14:30:00 EDT → 18:30:00 UTC', () => {
      const result = parseIbkrDate('23/04/2026;14:30:00 EDT')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 4, 23, 18, 30, 0)
    })

    it('CST (UTC-6): 09:00:00 CST → 15:00:00 UTC', () => {
      const result = parseIbkrDate('15/01/2026;09:00:00 CST')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 1, 15, 15, 0, 0)
    })

    it('CDT (UTC-5): 09:00:00 CDT → 14:00:00 UTC', () => {
      const result = parseIbkrDate('15/07/2026;09:00:00 CDT')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 7, 15, 14, 0, 0)
    })

    it('PST (UTC-8): 09:30:00 PST → 17:30:00 UTC', () => {
      const result = parseIbkrDate('10/02/2026;09:30:00 PST')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 2, 10, 17, 30, 0)
    })

    it('PDT (UTC-7): 09:30:00 PDT → 16:30:00 UTC', () => {
      const result = parseIbkrDate('10/08/2026;09:30:00 PDT')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 8, 10, 16, 30, 0)
    })

    it('UTC: 15:00:00 UTC → 15:00:00 UTC', () => {
      const result = parseIbkrDate('01/01/2026;15:00:00 UTC')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 1, 1, 15, 0, 0)
    })
  })

  describe('boundary times', () => {
    it('midnight UTC', () => {
      const result = parseIbkrDate('23/04/2026;00:00:00 UTC')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 4, 23, 0, 0, 0)
    })

    it('end of day UTC', () => {
      const result = parseIbkrDate('23/04/2026;23:59:59 UTC')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 4, 23, 23, 59, 59)
    })

    it('midnight crossing: 00:30:00 EST → previous day 05:30:00 UTC', () => {
      const result = parseIbkrDate('24/04/2026;00:30:00 EST')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 4, 24, 5, 30, 0)
    })
  })

  describe('DST transitions', () => {
    it('spring forward 2026-03-08: treats date as EST (wall clock before 2am)', () => {
      // Before the clock jumps — use EST=-5
      const result = parseIbkrDate('08/03/2026;01:30:00 EST')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 3, 8, 6, 30, 0)
    })

    it('fall back 2026-11-01: treats 01:30:00 EST as -5 (standard time)', () => {
      const result = parseIbkrDate('01/11/2026;01:30:00 EST')
      expect(result).not.toBeNull()
      expectUtcComponents(result!, 2026, 11, 1, 6, 30, 0)
    })
  })

  describe('invalid / null inputs', () => {
    it('null → returns null, no throw', () => {
      expect(() => parseIbkrDate(null)).not.toThrow()
      expect(parseIbkrDate(null)).toBeNull()
    })

    it('undefined → returns null', () => {
      expect(parseIbkrDate(undefined)).toBeNull()
    })

    it('empty string → returns null', () => {
      expect(parseIbkrDate('')).toBeNull()
    })

    it('no semicolon → returns null', () => {
      expect(parseIbkrDate('23/04/2026 14:30:00 EST')).toBeNull()
    })

    it('invalid date (32/13/2026) → returns null', () => {
      expect(parseIbkrDate('32/13/2026;14:30:00 EST')).toBeNull()
    })

    it('unknown TZ abbreviation → returns null', () => {
      expect(parseIbkrDate('23/04/2026;14:30:00 XYZ')).toBeNull()
    })

    it('missing TZ part → returns null', () => {
      expect(parseIbkrDate('23/04/2026;14:30:00')).toBeNull()
    })

    it('malformed time → returns null', () => {
      expect(parseIbkrDate('23/04/2026;not-a-time EST')).toBeNull()
    })
  })
})
