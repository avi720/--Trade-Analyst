export const TRADE_TIMEZONES = [
  { label: 'ישראל (UTC±2/3)',  value: 'Asia/Jerusalem'   },
  { label: 'UTC',               value: 'UTC'              },
  { label: 'ניו יורק (UTC±5)', value: 'America/New_York' },
  { label: 'שיקגו (UTC±6)',    value: 'America/Chicago'  },
]

export const DEFAULT_TIMEZONE = 'Asia/Jerusalem'

function getTzOffsetMs(date: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value)
  let h = get('hour')
  if (h === 24) h = 0
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'))
  return localMs - date.getTime()
}

/**
 * Converts a local date+time (YYYY-MM-DD / HH:MM) in the given IANA timezone to a UTC ISO string.
 * Two iterations handle DST boundary edge cases.
 */
export function localToUtcIso(dateStr: string, timeStr: string, tz: string): string {
  if (tz === 'UTC') return `${dateStr}T${timeStr}:00.000Z`
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  let utcMs = Date.UTC(y, mo - 1, d, h, mi, 0)
  for (let i = 0; i < 2; i++) {
    utcMs = Date.UTC(y, mo - 1, d, h, mi, 0) - getTzOffsetMs(new Date(utcMs), tz)
  }
  return new Date(utcMs).toISOString()
}

/**
 * Returns a short "HH:MM UTC" preview string for display next to a time input.
 * Returns empty string if inputs are invalid.
 */
export function toUtcPreview(dateStr: string, timeStr: string, tz: string): string {
  if (
    !dateStr || !timeStr ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
    !/^\d{2}:\d{2}$/.test(timeStr)
  ) return ''
  if (tz === 'UTC') return ''
  const iso = localToUtcIso(dateStr, timeStr, tz)
  return iso.slice(11, 16) + ' UTC'
}
