// IBKR Flex date format: "dd/MM/yyyy;HH:mm:ss TimeZone"
// Example: "23/04/2026;14:30:00 EST"
//
// date-fns parse() creates LOCAL timezone dates — unusable here.
// Instead we parse components manually and use Date.UTC() which is timezone-agnostic.

const TZ_OFFSETS_MINUTES: Record<string, number> = {
  EST: -300,
  EDT: -240,
  CST: -360,
  CDT: -300,
  PST: -480,
  PDT: -420,
  UTC: 0,
}

/**
 * Parse an IBKR Flex date/time string into a UTC Date.
 * Returns null (and logs an error) on any invalid input — never throws.
 */
export function parseIbkrDate(raw: string | null | undefined): Date | null {
  if (!raw || raw.trim() === '') {
    console.error('[parseIbkrDate] empty or null input')
    return null
  }

  const semicolonIdx = raw.indexOf(';')
  if (semicolonIdx === -1) {
    console.error('[parseIbkrDate] missing semicolon separator:', raw)
    return null
  }

  const datePart = raw.slice(0, semicolonIdx).trim()
  const timeWithTz = raw.slice(semicolonIdx + 1).trim()

  // Split "HH:mm:ss TZ" on last space to isolate timezone abbreviation
  const lastSpace = timeWithTz.lastIndexOf(' ')
  if (lastSpace === -1) {
    console.error('[parseIbkrDate] missing timezone in time part:', raw)
    return null
  }

  const timePart = timeWithTz.slice(0, lastSpace).trim()
  const tzAbbrev = timeWithTz.slice(lastSpace + 1).trim().toUpperCase()

  const offsetMinutes = TZ_OFFSETS_MINUTES[tzAbbrev]
  if (offsetMinutes === undefined) {
    console.error('[parseIbkrDate] unknown timezone abbreviation:', tzAbbrev, 'in:', raw)
    return null
  }

  // Parse date: dd/MM/yyyy
  const dateParts = datePart.split('/')
  if (dateParts.length !== 3) {
    console.error('[parseIbkrDate] invalid date format:', raw)
    return null
  }
  const day   = parseInt(dateParts[0], 10)
  const month = parseInt(dateParts[1], 10)
  const year  = parseInt(dateParts[2], 10)

  // Parse time: HH:mm:ss
  const timeParts = timePart.split(':')
  if (timeParts.length !== 3) {
    console.error('[parseIbkrDate] invalid time format:', raw)
    return null
  }
  const hours   = parseInt(timeParts[0], 10)
  const minutes = parseInt(timeParts[1], 10)
  const seconds = parseInt(timeParts[2], 10)

  // Validate component ranges
  if (
    isNaN(day) || isNaN(month) || isNaN(year) ||
    isNaN(hours) || isNaN(minutes) || isNaN(seconds) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hours < 0 || hours > 23 ||
    minutes < 0 || minutes > 59 ||
    seconds < 0 || seconds > 59
  ) {
    console.error('[parseIbkrDate] out-of-range date/time values:', raw)
    return null
  }

  // Date.UTC() treats all arguments as UTC — gives us the "wall clock as if UTC" timestamp.
  // Subtracting the timezone offset converts wall-clock-in-TZ → true UTC.
  // Example: 14:30:00 EST (offset=-300): wallClockUTC=14:30Z, utcMs=14:30Z+5h=19:30Z ✓
  const wallClockUtcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds)
  const utcMs = wallClockUtcMs - offsetMinutes * 60_000

  return new Date(utcMs)
}
