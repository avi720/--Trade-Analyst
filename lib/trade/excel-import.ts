import * as XLSX from 'xlsx'
import type { ManualLeg } from './manual-entry'

// Expected template column headers (case-insensitive)
const COL_ALIASES: Record<string, keyof ManualLeg> = {
  date:       'date',
  תאריך:     'date',
  time:       'time',
  שעה:       'time',
  ticker:     'ticker',
  טיקר:      'ticker',
  symbol:     'ticker',
  side:       'side',
  צד:        'side',
  buy_sell:   'side',
  quantity:   'quantity',
  qty:        'quantity',
  כמות:      'quantity',
  price:      'price',
  מחיר:      'price',
  commission: 'commission',
  עמ:        'commission',
  currency:   'currency',
  מטבע:      'currency',
}

function normalizeHeader(h: string): keyof ManualLeg | null {
  const key = h.trim().toLowerCase().replace(/['"]/g, '')
  return COL_ALIASES[key] ?? null
}

function normalizeDate(raw: unknown): string {
  if (typeof raw === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(raw)
    const mm = String(d.m).padStart(2, '0')
    const dd = String(d.d).padStart(2, '0')
    return `${d.y}-${mm}-${dd}`
  }
  const s = String(raw).trim()
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // DD/MM/YYYY
  const parts = s.split(/[\/\-.]/);
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
  }
  return s.slice(0, 10)
}

function normalizeTime(raw: unknown): string {
  if (typeof raw === 'number') {
    // Excel fraction of day
    const totalSec = Math.round(raw * 86400)
    const hh = Math.floor(totalSec / 3600)
    const mm = Math.floor((totalSec % 3600) / 60)
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
  }
  const s = String(raw).trim()
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5).padStart(5, '0')
  return '09:30'
}

function normalizeSide(raw: unknown): 'BUY' | 'SELL' {
  const s = String(raw).trim().toUpperCase()
  if (s === 'SELL' || s === 'S' || s === 'SHORT') return 'SELL'
  return 'BUY'
}

export interface ParseResult {
  legs: ManualLeg[]
  errors: string[]
}

export function parseExcelBuffer(buffer: ArrayBuffer): ParseResult {
  const errors: string[] = []
  let workbook: XLSX.WorkBook

  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  } catch {
    return { legs: [], errors: ['Failed to parse Excel file'] }
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { legs: [], errors: ['No sheets found in workbook'] }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: '' })

  if (rows.length === 0) return { legs: [], errors: ['Sheet is empty'] }

  // Map raw column names → ManualLeg keys
  const sampleRow = rows[0]
  const colMap: Record<string, keyof ManualLeg> = {}
  for (const rawCol of Object.keys(sampleRow)) {
    const mapped = normalizeHeader(rawCol)
    if (mapped) colMap[rawCol] = mapped
  }

  const required: Array<keyof ManualLeg> = ['ticker', 'date', 'side', 'quantity', 'price', 'currency']
  const mappedFields = new Set(Object.values(colMap))
  const missing = required.filter(f => !mappedFields.has(f))
  if (missing.length > 0) {
    return { legs: [], errors: [`Missing required columns: ${missing.join(', ')}`] }
  }

  const legs: ManualLeg[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const get = (field: keyof ManualLeg): unknown => {
      const col = Object.entries(colMap).find(([, v]) => v === field)?.[0]
      return col ? row[col] : ''
    }

    const rawTicker = String(get('ticker') ?? '').trim().toUpperCase()
    if (!rawTicker) {
      errors.push(`Row ${i + 2}: ticker is empty — skipped`)
      continue
    }

    const qty = parseFloat(String(get('quantity'))) || 0
    const price = parseFloat(String(get('price'))) || 0
    const commission = parseFloat(String(get('commission') ?? '0')) || 0

    if (qty <= 0) { errors.push(`Row ${i + 2}: quantity must be positive`); continue }
    if (price <= 0) { errors.push(`Row ${i + 2}: price must be positive`); continue }

    legs.push({
      ticker: rawTicker,
      date: normalizeDate(get('date')),
      time: normalizeTime(get('time')),
      side: normalizeSide(get('side')),
      quantity: qty,
      price,
      commission,
      currency: String(get('currency') ?? 'USD').trim().toUpperCase() || 'USD',
    })
  }

  return { legs, errors }
}

export function generateTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const header = ['date', 'time', 'ticker', 'side', 'quantity', 'price', 'commission', 'currency']
  const example = ['2026-01-15', '09:30', 'AAPL', 'BUY', 100, 150.00, 1.00, 'USD']
  const ws = XLSX.utils.aoa_to_sheet([header, example])
  // Column widths
  ws['!cols'] = header.map(() => ({ wch: 14 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Trades')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return buf
}
