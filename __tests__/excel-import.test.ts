import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExcelBuffer, generateTemplate } from '@/lib/trade/excel-import'

function makeBuffer(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const HEADER = ['date', 'time', 'ticker', 'side', 'quantity', 'price', 'commission', 'currency']
const ROW1   = ['2026-01-15', '09:30', 'AAPL', 'BUY', 100, 150.00, 1.00, 'USD']
const ROW2   = ['2026-01-16', '10:00', 'MSFT', 'SELL', 50, 400.00, 0.50, 'USD']

describe('parseExcelBuffer', () => {
  it('parses a valid two-row sheet', () => {
    const buf = makeBuffer([HEADER, ROW1, ROW2])
    const { legs, errors } = parseExcelBuffer(buf)
    expect(errors).toHaveLength(0)
    expect(legs).toHaveLength(2)
    expect(legs[0].ticker).toBe('AAPL')
    expect(legs[0].side).toBe('BUY')
    expect(legs[0].quantity).toBe(100)
    expect(legs[0].price).toBe(150.00)
    expect(legs[0].currency).toBe('USD')
    expect(legs[1].ticker).toBe('MSFT')
    expect(legs[1].side).toBe('SELL')
  })

  it('normalizes ticker to uppercase', () => {
    const buf = makeBuffer([HEADER, ['2026-01-15', '09:30', 'aapl', 'BUY', 100, 150, 0, 'USD']])
    const { legs } = parseExcelBuffer(buf)
    expect(legs[0].ticker).toBe('AAPL')
  })

  it('normalizes side SELL variants', () => {
    const buf = makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'S', 100, 150, 0, 'USD']])
    const { legs } = parseExcelBuffer(buf)
    expect(legs[0].side).toBe('SELL')
  })

  it('normalizes side SHORT to SELL', () => {
    const buf = makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'SHORT', 100, 150, 0, 'USD']])
    const { legs } = parseExcelBuffer(buf)
    expect(legs[0].side).toBe('SELL')
  })

  it('treats unknown side as BUY', () => {
    const buf = makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'HOLD', 100, 150, 0, 'USD']])
    const { legs } = parseExcelBuffer(buf)
    expect(legs[0].side).toBe('BUY')
  })

  it('skips row with empty ticker and records a warning', () => {
    const buf = makeBuffer([HEADER, ['2026-01-15', '09:30', '', 'BUY', 100, 150, 0, 'USD']])
    const { legs, errors } = parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.some(e => e.toLowerCase().includes('ticker'))).toBe(true)
  })

  it('skips row with zero quantity and records a warning', () => {
    const buf = makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'BUY', 0, 150, 0, 'USD']])
    const { legs, errors } = parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('skips row with zero price and records a warning', () => {
    const buf = makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'BUY', 100, 0, 0, 'USD']])
    const { legs, errors } = parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('returns error when required column is missing', () => {
    const badHeader = ['date', 'time', 'side', 'quantity', 'price', 'commission', 'currency'] // no ticker
    const buf = makeBuffer([badHeader, ROW1.slice(1)])
    const { legs, errors } = parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.some(e => e.toLowerCase().includes('ticker'))).toBe(true)
  })

  it('accepts Hebrew header aliases', () => {
    const hebrewHeader = ['תאריך', 'שעה', 'טיקר', 'צד', 'כמות', 'מחיר', 'עמ', 'מטבע']
    const buf = makeBuffer([hebrewHeader, ROW1])
    const { legs, errors } = parseExcelBuffer(buf)
    expect(errors).toHaveLength(0)
    expect(legs).toHaveLength(1)
    expect(legs[0].ticker).toBe('AAPL')
  })

  it('defaults missing commission to 0', () => {
    const noCommHeader = ['date', 'time', 'ticker', 'side', 'quantity', 'price', 'currency']
    const noCommRow = ['2026-01-15', '09:30', 'AAPL', 'BUY', 100, 150, 'USD']
    const buf = makeBuffer([noCommHeader, noCommRow])
    const { legs } = parseExcelBuffer(buf)
    expect(legs[0]?.commission ?? 0).toBe(0)
  })

  it('returns error for empty sheet', () => {
    const buf = makeBuffer([[]])
    const { legs, errors } = parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe('generateTemplate', () => {
  it('returns a valid xlsx buffer with example row', () => {
    const buf = generateTemplate()
    expect(buf).toBeTruthy()
    const wb = XLSX.read(buf, { type: 'array' })
    expect(wb.SheetNames).toHaveLength(1)
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
    expect(rows).toHaveLength(1)
    expect(rows[0].ticker).toBe('AAPL')
  })

  it('template can be re-parsed by parseExcelBuffer', () => {
    const buf = generateTemplate()
    const { legs, errors } = parseExcelBuffer(buf)
    expect(errors).toHaveLength(0)
    expect(legs).toHaveLength(1)
    expect(legs[0].side).toBe('BUY')
  })
})
