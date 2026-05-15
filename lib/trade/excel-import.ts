import * as XLSX from 'xlsx'
import type { ManualLeg } from './manual-entry'

// Expected template column headers (case-insensitive, underscores/spaces normalised)
const COL_ALIASES: Record<string, keyof ManualLeg> = {
  // ── Required execution fields ──
  date:               'date',
  תאריך:             'date',
  time:               'time',
  שעה:               'time',
  ticker:             'ticker',
  טיקר:              'ticker',
  symbol:             'ticker',
  side:               'side',
  צד:                'side',
  buy_sell:           'side',
  quantity:           'quantity',
  qty:                'quantity',
  כמות:              'quantity',
  price:              'price',
  מחיר:              'price',
  commission:         'commission',
  עמלה:              'commission',
  עמ:                'commission',
  currency:           'currency',
  מטבע:              'currency',

  // ── Optional order-detail fields ──
  commission_currency:      'commissionCurrency',
  commissioncurrency:       'commissionCurrency',
  מטבע_עמלה:               'commissionCurrency',
  מטבע_עמ:                 'commissionCurrency',
  order_type:               'orderType',
  ordertype:                'orderType',
  סוג_פקודה:               'orderType',
  סוג_פעולה:               'orderType',
  order_date:               'orderPlacedDate',
  orderdate:                'orderPlacedDate',
  order_placed_date:        'orderPlacedDate',
  תאריך_הזמנה:             'orderPlacedDate',
  order_time:               'orderPlacedTime',
  ordertime:                'orderPlacedTime',
  order_placed_time:        'orderPlacedTime',
  שעת_הזמנה:               'orderPlacedTime',
  broker:                   'broker',
  ברוקר:                   'broker',

  // ── Personal annotation fields (Trade-level) ──
  setup:                    'setupType',
  setup_type:               'setupType',
  setuptype:                'setupType',
  סגנון:                   'setupType',
  סגנון_מסחר:              'setupType',
  emotional_state:          'emotionalState',
  emotionalstate:           'emotionalState',
  emotion:                  'emotionalState',
  מצב_רגשי:                'emotionalState',
  stop:                     'stopPrice',
  stop_price:               'stopPrice',
  stopprice:                'stopPrice',
  עצירה:                   'stopPrice',
  מחיר_עצירה:              'stopPrice',
  target:                   'targetPrice',
  target_price:             'targetPrice',
  targetprice:              'targetPrice',
  יעד:                     'targetPrice',
  מחיר_יעד:                'targetPrice',
  notes:                    'notes',
  הערות:                   'notes',
  did_right:                'didRight',
  didright:                 'didRight',
  מה_עשיתי_נכון:           'didRight',
  would_change:             'wouldChange',
  wouldchange:              'wouldChange',
  מה_הייתי_משנה:           'wouldChange',
}

function normalizeHeader(h: string): keyof ManualLeg | null {
  // Lowercase, strip quotes, collapse spaces/dashes to underscores
  const key = h
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[\s\-]+/g, '_')
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
  // DD/MM/YYYY or DD-MM-YYYY
  const parts = s.split(/[\/\-.]/)
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return s.slice(0, 10)
}

function normalizeTime(raw: unknown): string {
  if (typeof raw === 'number') {
    // Excel fraction of day
    const totalSec = Math.round(raw * 86400)
    const hh = Math.floor(totalSec / 3600)
    const mm = Math.floor((totalSec % 3600) / 60)
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
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

    // Optional numeric fields
    const rawStop = String(get('stopPrice') ?? '').trim()
    const rawTarget = String(get('targetPrice') ?? '').trim()
    const stopParsed = rawStop ? parseFloat(rawStop) : NaN
    const targetParsed = rawTarget ? parseFloat(rawTarget) : NaN

    // Optional string fields
    const str = (field: keyof ManualLeg): string | undefined => {
      const v = String(get(field) ?? '').trim()
      return v || undefined
    }

    // Optional date/time helpers (validated in buildExecutions)
    const rawOrderDate = str('orderPlacedDate')
    const rawOrderTime = str('orderPlacedTime')

    legs.push({
      ticker: rawTicker,
      date: normalizeDate(get('date')),
      time: normalizeTime(get('time')),
      side: normalizeSide(get('side')),
      quantity: qty,
      price,
      commission,
      currency: String(get('currency') ?? 'USD').trim().toUpperCase() || 'USD',
      // Optional order-level
      commissionCurrency: str('commissionCurrency'),
      orderType: str('orderType'),
      orderPlacedDate: rawOrderDate ? normalizeDate(rawOrderDate) : undefined,
      orderPlacedTime: rawOrderTime ? normalizeTime(rawOrderTime) : undefined,
      broker: str('broker'),
      // Optional annotation fields
      setupType: str('setupType'),
      emotionalState: str('emotionalState'),
      stopPrice: isNaN(stopParsed) ? undefined : stopParsed,
      targetPrice: isNaN(targetParsed) ? undefined : targetParsed,
      notes: str('notes'),
      didRight: str('didRight'),
      wouldChange: str('wouldChange'),
    })
  }

  return { legs, errors }
}

export function generateTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const header = [
    // Required
    'date', 'time', 'ticker', 'side', 'quantity', 'price', 'commission', 'currency',
    // Order details
    'commission_currency', 'order_type', 'order_date', 'order_time', 'broker',
    // Annotations
    'setup_type', 'emotional_state', 'stop_price', 'target_price', 'notes', 'did_right', 'would_change',
  ]

  const example = [
    '2026-01-15', '09:30', 'AAPL', 'BUY', 100, 150.00, 1.00, 'USD',
    // Order details (all optional)
    'USD', 'LIMIT', '2026-01-15', '09:29', 'IBKR',
    // Annotations (all optional)
    'Breakout', 'Calm', 145.00, 165.00, 'Strong volume', 'Waited for confirmation', 'Enter earlier',
  ]

  const ws = XLSX.utils.aoa_to_sheet([header, example])
  ws['!cols'] = header.map(() => ({ wch: 16 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Trades')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return buf
}
