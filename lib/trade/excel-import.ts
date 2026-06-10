import ExcelJS from 'exceljs'
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
  // wouldChange intentionally removed — it's a close-time field now.
  setup:                    'setupType',
  setup_type:               'setupType',
  setuptype:                'setupType',
  סגנון:                   'setupType',
  סגנון_מסחר:              'setupType',
  סיבת_קנייה:              'setupType',
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
  // exceljs returns Date objects for date-typed cells
  if (raw instanceof Date) {
    const yyyy = raw.getUTCFullYear()
    const mm = String(raw.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(raw.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
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
  // exceljs may surface time-only cells as Date with epoch base; rare for our template.
  if (raw instanceof Date) {
    const hh = String(raw.getUTCHours()).padStart(2, '0')
    const mm = String(raw.getUTCMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
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

// Unwrap an exceljs cell value (which can be string, number, Date, formula result wrapper, or rich text)
function cellToPrimitive(v: ExcelJS.CellValue): unknown {
  if (v == null) return ''
  if (typeof v === 'object') {
    // Formula result: { formula, result }
    if ('result' in v && v.result !== undefined) return v.result
    // Rich text: { richText: [{ text }, ...] }
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((p) => p.text).join('')
    }
    // Hyperlink: { text, hyperlink }
    if ('text' in v) return v.text
    // Date
    if (v instanceof Date) return v
  }
  return v
}

export interface ParseResult {
  legs: ManualLeg[]
  errors: string[]
}

export async function parseExcelBuffer(buffer: ArrayBuffer): Promise<ParseResult> {
  const errors: string[] = []
  const workbook = new ExcelJS.Workbook()

  try {
    await workbook.xlsx.load(buffer)
  } catch {
    return { legs: [], errors: ['Failed to parse Excel file'] }
  }

  const sheet = workbook.worksheets[0]
  if (!sheet) return { legs: [], errors: ['No sheets found in workbook'] }

  // Collect rows as arrays. row.values has a leading null (exceljs is 1-indexed),
  // so we strip the [0] slot. Header is row 1; data rows are 2..rowCount.
  const headerRow = sheet.getRow(1)
  const rawHeaders: string[] = []
  // headerRow.values can be sparse; getCell is safe across columns.
  // Walk by actualCellCount range — collect every column from 1..columnCount.
  const columnCount = sheet.columnCount
  for (let c = 1; c <= columnCount; c++) {
    const cell = headerRow.getCell(c)
    const val = cellToPrimitive(cell.value)
    rawHeaders.push(val == null ? '' : String(val))
  }

  if (rawHeaders.every((h) => !h.trim())) {
    return { legs: [], errors: ['Sheet is empty'] }
  }

  // Map raw column index → ManualLeg field
  const colMap: Record<number, keyof ManualLeg> = {}
  for (let c = 0; c < rawHeaders.length; c++) {
    const h = rawHeaders[c]
    if (!h.trim()) continue
    const mapped = normalizeHeader(h)
    if (mapped) colMap[c + 1] = mapped // store 1-indexed for getCell()
  }

  const required: Array<keyof ManualLeg> = ['ticker', 'date', 'side', 'quantity', 'price', 'currency']
  const mappedFields = new Set(Object.values(colMap))
  const missing = required.filter((f) => !mappedFields.has(f))
  if (missing.length > 0) {
    return { legs: [], errors: [`Missing required columns: ${missing.join(', ')}`] }
  }

  const lastRow = sheet.rowCount
  if (lastRow < 2) return { legs: [], errors: ['Sheet is empty'] }

  // Reverse the colMap to: field → 1-indexed column
  const fieldToCol: Partial<Record<keyof ManualLeg, number>> = {}
  for (const [colStr, field] of Object.entries(colMap)) {
    fieldToCol[field] = Number(colStr)
  }

  const get = (row: ExcelJS.Row, field: keyof ManualLeg): unknown => {
    const c = fieldToCol[field]
    if (!c) return ''
    return cellToPrimitive(row.getCell(c).value)
  }

  const legs: ManualLeg[] = []

  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r)

    // Skip blank rows entirely — exceljs reports rowCount including trailing blanks.
    const ticker = String(get(row, 'ticker') ?? '').trim()
    const dateVal = get(row, 'date')
    if (!ticker && (dateVal == null || String(dateVal).trim() === '')) continue

    const rawTicker = ticker.toUpperCase().replace(/[^A-Z.]/g, '')
    if (!rawTicker) {
      errors.push(`Row ${r}: ticker is empty — skipped`)
      continue
    }

    const qty = parseFloat(String(get(row, 'quantity'))) || 0
    const price = parseFloat(String(get(row, 'price'))) || 0
    const commission = parseFloat(String(get(row, 'commission') ?? '0')) || 0

    if (qty <= 0) { errors.push(`Row ${r}: quantity must be positive`); continue }
    if (price <= 0) { errors.push(`Row ${r}: price must be positive`); continue }

    // Optional numeric fields
    const rawStop = String(get(row, 'stopPrice') ?? '').trim()
    const rawTarget = String(get(row, 'targetPrice') ?? '').trim()
    const stopParsed = rawStop ? parseFloat(rawStop) : NaN
    const targetParsed = rawTarget ? parseFloat(rawTarget) : NaN

    // Optional string fields
    const str = (field: keyof ManualLeg): string | undefined => {
      const v = String(get(row, field) ?? '').trim()
      return v || undefined
    }

    // Optional date/time helpers (validated in buildExecutions)
    const rawOrderDate = str('orderPlacedDate')
    const rawOrderTime = str('orderPlacedTime')

    legs.push({
      ticker: rawTicker,
      date: normalizeDate(dateVal),
      time: normalizeTime(get(row, 'time')),
      side: normalizeSide(get(row, 'side')),
      quantity: qty,
      price,
      commission,
      currency: String(get(row, 'currency') ?? 'USD').trim().toUpperCase() || 'USD',
      // Optional order-level
      commissionCurrency: str('commissionCurrency')?.toUpperCase(),
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
    })
  }

  return { legs, errors }
}

export async function generateTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Trades')

  const header = [
    // Required
    'date', 'time', 'ticker', 'side', 'quantity', 'price', 'commission', 'currency',
    // Order details
    'commission_currency', 'order_type', 'order_date', 'order_time', 'broker',
    // Annotations (open-time only — "would_change" is captured at close, not here)
    'setup_type', 'emotional_state', 'stop_price', 'target_price', 'notes', 'did_right',
  ]

  const example = [
    '2026-01-15', '09:30', 'AAPL', 'BUY', 100, 150.00, 1.00, 'USD',
    // Order details (all optional)
    'USD', 'LIMIT', '2026-01-15', '09:29', 'IBKR',
    // Annotations (all optional). Examples use the canonical Hebrew values:
    'פריצת תבנית - דגל שורי', 'רגוע', 145.00, 165.00, 'Strong volume', 'Waited for confirmation',
  ]

  ws.addRow(header)
  ws.addRow(example)
  ws.columns = header.map(() => ({ width: 16 }))

  const buf = await wb.xlsx.writeBuffer()
  // exceljs returns a Node Buffer or ArrayBuffer depending on runtime.
  // Normalise to ArrayBuffer so the route handler can hand it to NextResponse.
  if (buf instanceof ArrayBuffer) return buf
  // Node Buffer path: wrap the underlying ArrayBuffer + offset/length into a fresh view
  const u8 = buf as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number }
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}
