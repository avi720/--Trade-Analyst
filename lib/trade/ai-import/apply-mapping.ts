import type { ManualLeg } from '@/lib/trade/manual-entry'
import { CURRENCIES } from '@/lib/constants/trade-options'
import type {
  MappingResult,
  Transformations,
  MappableField,
  ApplyResult,
  LegError,
} from './types'

const CURRENCY_SET = new Set<string>(CURRENCIES as readonly string[])

// ─── Cell → primitive readers ─────────────────────────────────────────────

function readCell(row: unknown[], colIndex: number | null | undefined): unknown {
  if (colIndex == null || colIndex < 0 || colIndex >= row.length) return undefined
  return row[colIndex]
}

/** Strip thousands separators / currency glyphs / spaces, then parseFloat. */
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (v == null) return NaN
  const s = String(v).replace(/[,$€₪£\s]/g, '')
  return parseFloat(s)
}

// ─── Date parsing ─────────────────────────────────────────────────────────

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30) // Excel serial 0 (handles the 1900 leap bug)

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dateFromExcelSerial(serial: number): string {
  const ms = EXCEL_EPOCH_UTC + Math.floor(serial) * 86_400_000
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function parseDate(raw: unknown, fmt: Transformations['dateFormat']): string | null {
  if (raw instanceof Date) {
    return `${raw.getUTCFullYear()}-${pad2(raw.getUTCMonth() + 1)}-${pad2(raw.getUTCDate())}`
  }
  if (fmt === 'excel-serial') {
    const n = toNumber(raw)
    if (!Number.isFinite(n)) return null
    return dateFromExcelSerial(n)
  }
  const s = String(raw ?? '').trim()
  if (!s) return null

  if (fmt === 'iso') {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return null
  }

  // Delimited numeric formats: dd/MM/yyyy, MM/dd/yyyy, dd-MM-yyyy
  const parts = s.split(/[/\-.]/).map((p) => p.trim())
  if (parts.length !== 3) return null
  let dd: string, mm: string, yyyy: string
  if (fmt === 'MM/dd/yyyy') {
    ;[mm, dd, yyyy] = parts
  } else {
    // dd/MM/yyyy and dd-MM-yyyy
    ;[dd, mm, yyyy] = parts
  }
  if (yyyy.length !== 4) return null
  const d = Number(dd), m = Number(mm), y = Number(yyyy)
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${yyyy}-${pad2(m)}-${pad2(d)}`
}

// ─── Time parsing ─────────────────────────────────────────────────────────

function timeFromExcelFraction(value: number): string {
  const frac = value - Math.floor(value)
  const totalMinutes = Math.round(frac * 24 * 60)
  const hh = Math.floor(totalMinutes / 60) % 24
  const mm = totalMinutes % 60
  return `${pad2(hh)}:${pad2(mm)}`
}

function parseTime(raw: unknown, fmt: Transformations['timeFormat']): string {
  const DEFAULT = '09:30'
  if (raw == null || raw === '') return DEFAULT
  if (raw instanceof Date) {
    return `${pad2(raw.getUTCHours())}:${pad2(raw.getUTCMinutes())}`
  }
  if (fmt === 'excel-serial') {
    const n = toNumber(raw)
    if (!Number.isFinite(n)) return DEFAULT
    return timeFromExcelFraction(n)
  }
  const s = String(raw).trim()
  if (fmt === 'h:mm a') {
    const m = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]?/)
    if (m) {
      let h = Number(m[1]) % 12
      if (/[Pp]/.test(m[3])) h += 12
      return `${pad2(h)}:${m[2]}`
    }
  }
  // HH:mm / HH:mm:ss and any generic H:MM
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (m) return `${pad2(Number(m[1]))}:${m[2]}`
  return DEFAULT
}

// ─── Side resolution ──────────────────────────────────────────────────────

const BUILTIN_SELL = new Set(['SELL', 'S', 'SHORT', 'SLD', 'SL'])
const BUILTIN_BUY = new Set(['BUY', 'B', 'LONG', 'BOT', 'BUYTOOPEN'])

function resolveSide(
  sideRaw: unknown,
  quantityRaw: unknown,
  t: Transformations,
): 'BUY' | 'SELL' | null {
  if (t.sideEncoding === 'signed-quantity') {
    const q = toNumber(quantityRaw)
    if (!Number.isFinite(q) || q === 0) return null
    return q < 0 ? 'SELL' : 'BUY'
  }
  const s = String(sideRaw ?? '').trim().toUpperCase()
  if (!s) return null
  if (t.sideMap.sell.some((v) => v.trim().toUpperCase() === s)) return 'SELL'
  if (t.sideMap.buy.some((v) => v.trim().toUpperCase() === s)) return 'BUY'
  if (BUILTIN_SELL.has(s)) return 'SELL'
  if (BUILTIN_BUY.has(s)) return 'BUY'
  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────

/**
 * Deterministically applies an AI-produced flat-table mapping to every data row
 * of the chosen sheet. Pure — no timezone injection (finalize-legs does that),
 * no DB. Rows that fail to yield a usable leg are recorded in `errors` by their
 * absolute row index in the sheet.
 */
export function applyMapping(rows: unknown[][], mapping: MappingResult): ApplyResult {
  const legs: ManualLeg[] = []
  const errors: LegError[] = []
  const t = mapping.transformations
  const cm = mapping.columnMap

  const str = (row: unknown[], field: MappableField): string | undefined => {
    const v = readCell(row, cm[field])
    if (v == null) return undefined
    const s = String(v).trim()
    return s || undefined
  }
  const num = (row: unknown[], field: MappableField): number | undefined => {
    if (cm[field] == null) return undefined
    const n = toNumber(readCell(row, cm[field]))
    return Number.isFinite(n) ? n : undefined
  }

  for (let r = mapping.dataStartRowIndex; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue

    // Skip fully-blank rows silently.
    const nonEmpty = row.some((c) => c != null && String(c).trim() !== '')
    if (!nonEmpty) continue

    const tickerRaw = str(row, 'ticker')
    const ticker = tickerRaw ? tickerRaw.toUpperCase().replace(/[^A-Z0-9.]/g, '') : ''
    if (!ticker) {
      errors.push({ rowIndex: r, reason: 'ticker missing or unreadable' })
      continue
    }

    const date = parseDate(readCell(row, cm.date), t.dateFormat)
    if (!date) {
      errors.push({ rowIndex: r, reason: 'date could not be parsed' })
      continue
    }

    const side = resolveSide(readCell(row, cm.side), readCell(row, cm.quantity), t)
    if (!side) {
      errors.push({ rowIndex: r, reason: 'side could not be determined' })
      continue
    }

    const qtyRaw = num(row, 'quantity')
    const quantity = qtyRaw == null ? NaN : Math.abs(qtyRaw)
    const price = num(row, 'price') ?? NaN
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({ rowIndex: r, reason: 'quantity must be a positive number' })
      continue
    }
    if (!Number.isFinite(price) || price <= 0) {
      errors.push({ rowIndex: r, reason: 'price must be a positive number' })
      continue
    }

    const currencyRaw = str(row, 'currency')?.toUpperCase()
    const currency = currencyRaw && CURRENCY_SET.has(currencyRaw) ? currencyRaw : t.defaultCurrency

    const commissionCurrencyRaw = str(row, 'commissionCurrency')?.toUpperCase()

    const leg: ManualLeg = {
      ticker,
      date,
      time: parseTime(readCell(row, cm.time), t.timeFormat),
      side,
      quantity,
      price,
      commission: num(row, 'commission') ?? 0,
      currency,
      // Optional order-level
      commissionCurrency:
        commissionCurrencyRaw && CURRENCY_SET.has(commissionCurrencyRaw)
          ? commissionCurrencyRaw
          : undefined,
      orderType: str(row, 'orderType'),
      orderPlacedDate:
        cm.orderPlacedDate != null
          ? parseDate(readCell(row, cm.orderPlacedDate), t.dateFormat) ?? undefined
          : undefined,
      orderPlacedTime:
        cm.orderPlacedTime != null
          ? parseTime(readCell(row, cm.orderPlacedTime), t.timeFormat)
          : undefined,
      broker: str(row, 'broker'),
      // Optional annotations
      setupType: str(row, 'setupType'),
      emotionalState: str(row, 'emotionalState'),
      stopPrice: num(row, 'stopPrice'),
      targetPrice: num(row, 'targetPrice'),
      notes: str(row, 'notes'),
      didRight: str(row, 'didRight'),
    }

    legs.push(leg)
  }

  return { legs, errors }
}
