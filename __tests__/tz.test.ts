import { describe, it, expect } from 'vitest'
import { localToUtcIso, toUtcPreview } from '../lib/trade/tz'

describe('localToUtcIso', () => {
  it('UTC passthrough — no offset applied', () => {
    const result = localToUtcIso('2026-05-24', '16:30', 'UTC')
    expect(result).toBe('2026-05-24T16:30:00.000Z')
  })

  it('Israel summer (IDT = UTC+3): 16:30 local → 13:30 UTC', () => {
    // IDT is active from late March to late October
    const result = localToUtcIso('2026-05-24', '16:30', 'Asia/Jerusalem')
    expect(result.slice(11, 16)).toBe('13:30')
  })

  it('Israel winter (IST = UTC+2): 16:30 local → 14:30 UTC', () => {
    // IST is active from late October to late March
    const result = localToUtcIso('2026-01-15', '16:30', 'Asia/Jerusalem')
    expect(result.slice(11, 16)).toBe('14:30')
  })

  it('New York summer (EDT = UTC-4): 09:30 local → 13:30 UTC', () => {
    const result = localToUtcIso('2026-05-24', '09:30', 'America/New_York')
    expect(result.slice(11, 16)).toBe('13:30')
  })

  it('New York winter (EST = UTC-5): 09:30 local → 14:30 UTC', () => {
    const result = localToUtcIso('2026-01-15', '09:30', 'America/New_York')
    expect(result.slice(11, 16)).toBe('14:30')
  })

  it('returns valid ISO string format', () => {
    const result = localToUtcIso('2026-05-24', '10:00', 'Asia/Jerusalem')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('toUtcPreview', () => {
  it('returns empty string for UTC timezone', () => {
    expect(toUtcPreview('2026-05-24', '16:30', 'UTC')).toBe('')
  })

  it('returns empty string for invalid date', () => {
    expect(toUtcPreview('invalid', '16:30', 'Asia/Jerusalem')).toBe('')
  })

  it('returns empty string for invalid time', () => {
    expect(toUtcPreview('2026-05-24', '', 'Asia/Jerusalem')).toBe('')
  })

  it('returns HH:MM UTC for Israel summer', () => {
    const preview = toUtcPreview('2026-05-24', '16:30', 'Asia/Jerusalem')
    expect(preview).toBe('13:30 UTC')
  })

  it('returns HH:MM UTC for Israel winter', () => {
    const preview = toUtcPreview('2026-01-15', '16:30', 'Asia/Jerusalem')
    expect(preview).toBe('14:30 UTC')
  })
})
