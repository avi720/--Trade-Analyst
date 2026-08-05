import { describe, it, expect } from 'vitest'
import {
  appendNoteLine,
  formatNoteDate,
  formatPositionNote,
  positionNotePrefix,
} from '@/lib/trade/position-notes'

describe('formatNoteDate', () => {
  it('converts YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(formatNoteDate('2026-08-05')).toBe('05/08/2026')
  })

  it('keeps the day the user picked regardless of runtime timezone', () => {
    // A Date round-trip would shift 2026-01-01 to 31/12/2025 west of UTC.
    expect(formatNoteDate('2026-01-01')).toBe('01/01/2026')
  })

  it('returns the input unchanged when it is not in the expected shape', () => {
    expect(formatNoteDate('05/08/2026')).toBe('05/08/2026')
  })
})

describe('positionNotePrefix', () => {
  it('builds the add lead-in', () => {
    expect(positionNotePrefix('add', '2026-08-05')).toBe('בתאריך 05/08/2026 הוספתי כסף לפוזיציה כי')
  })

  it('builds the reduce lead-in', () => {
    expect(positionNotePrefix('reduce', '2026-08-05')).toBe('בתאריך 05/08/2026 מכרתי חלק מהפוזיציה כי')
  })
})

describe('formatPositionNote', () => {
  it('joins the fixed prefix with the user reason', () => {
    expect(formatPositionNote('add', '2026-08-05', 'הסטאפ נראה חזק')).toBe(
      'בתאריך 05/08/2026 הוספתי כסף לפוזיציה כי הסטאפ נראה חזק'
    )
  })

  it('trims the reason', () => {
    expect(formatPositionNote('reduce', '2026-08-05', '  לקחתי רווח  ')).toBe(
      'בתאריך 05/08/2026 מכרתי חלק מהפוזיציה כי לקחתי רווח'
    )
  })

  it('returns null for a blank reason — no dangling "כי"', () => {
    expect(formatPositionNote('add', '2026-08-05', '')).toBeNull()
    expect(formatPositionNote('add', '2026-08-05', '   ')).toBeNull()
    expect(formatPositionNote('add', '2026-08-05', null)).toBeNull()
    expect(formatPositionNote('add', '2026-08-05', undefined)).toBeNull()
  })
})

describe('appendNoteLine', () => {
  it('returns the line alone when there are no existing notes', () => {
    expect(appendNoteLine(null, 'שורה')).toBe('שורה')
    expect(appendNoteLine('', 'שורה')).toBe('שורה')
    expect(appendNoteLine('   ', 'שורה')).toBe('שורה')
    expect(appendNoteLine(undefined, 'שורה')).toBe('שורה')
  })

  it('appends on a new line, preserving earlier entries', () => {
    expect(appendNoteLine('ראשונה', 'שנייה')).toBe('ראשונה\nשנייה')
    expect(appendNoteLine('ראשונה\nשנייה', 'שלישית')).toBe('ראשונה\nשנייה\nשלישית')
  })
})
