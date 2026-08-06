/**
 * Canonical wording for the notes appended when a user adds to, or trims, an
 * open position from the search tab.
 *
 * The lead-in ("בתאריך DD/MM/YYYY הוספתי כסף לפוזיציה כי") is fixed on purpose:
 * it is what makes these lines recognisable among free-form notes, and what the
 * search tab's notes filter can match on. It is therefore composed HERE, on the
 * server — the client renders it as static text next to the textarea and only
 * ever sends the user's own reason.
 *
 * Shared with the close flow's `modifiedStopNote` through `appendNoteLine`, so
 * every note the app appends to Trade.notes joins the same way.
 */

export type PositionNoteKind = 'add' | 'reduce'

/** The immutable part of the sentence, after the date. */
const KIND_PHRASE: Record<PositionNoteKind, string> = {
  add: 'הוספתי כסף לפוזיציה כי',
  reduce: 'מכרתי חלק מהפוזיציה כי',
}

/**
 * YYYY-MM-DD → DD/MM/YYYY. Pure string work, deliberately not via `new Date()`:
 * parsing to a Date and back can shift the day across a timezone boundary, and
 * the date shown in the note must be exactly the one the user picked.
 * Returns the input unchanged if it isn't in the expected shape.
 */
export function formatNoteDate(dateYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd)
  if (!m) return dateYmd
  const [, y, mo, d] = m
  return `${d}/${mo}/${y}`
}

/** The fixed lead-in the user cannot edit, e.g. "בתאריך 05/08/2026 הוספתי כסף לפוזיציה כי". */
export function positionNotePrefix(kind: PositionNoteKind, dateYmd: string): string {
  return `בתאריך ${formatNoteDate(dateYmd)} ${KIND_PHRASE[kind]}`
}

/**
 * Full note line, or null when the user gave no reason.
 *
 * A blank reason means nothing is written to Trade.notes at all — not even the
 * prefix. A dangling "…כי" would read as a truncated sentence, and the reason
 * is optional by product decision.
 */
export function formatPositionNote(
  kind: PositionNoteKind,
  dateYmd: string,
  reason: string | null | undefined,
): string | null {
  const trimmed = reason?.trim()
  if (!trimmed) return null
  return `${positionNotePrefix(kind, dateYmd)} ${trimmed}`
}

/** Appends a note line to existing notes, keeping one line per entry. */
export function appendNoteLine(existing: string | null | undefined, line: string): string {
  const base = existing?.trim()
  return base ? `${base}\n${line}` : line
}
