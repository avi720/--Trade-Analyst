import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseExcelBuffer, generateTemplate } from '@/lib/trade/excel-import'

async function makeBuffer(rows: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  for (const row of rows) {
    ws.addRow(row as ExcelJS.CellValue[])
  }
  const buf = await wb.xlsx.writeBuffer()
  if (buf instanceof ArrayBuffer) return buf
  const u8 = buf as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number }
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

const HEADER = ['date', 'time', 'ticker', 'side', 'quantity', 'price', 'commission', 'currency']
const ROW1   = ['2026-01-15', '09:30', 'AAPL', 'BUY', 100, 150.00, 1.00, 'USD']
const ROW2   = ['2026-01-16', '10:00', 'MSFT', 'SELL', 50, 400.00, 0.50, 'USD']

describe('parseExcelBuffer', () => {
  it('parses a valid two-row sheet', async () => {
    const buf = await makeBuffer([HEADER, ROW1, ROW2])
    const { legs, errors } = await parseExcelBuffer(buf)
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

  it('normalizes ticker to uppercase', async () => {
    const buf = await makeBuffer([HEADER, ['2026-01-15', '09:30', 'aapl', 'BUY', 100, 150, 0, 'USD']])
    const { legs } = await parseExcelBuffer(buf)
    expect(legs[0].ticker).toBe('AAPL')
  })

  it('normalizes side SELL variants', async () => {
    const buf = await makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'S', 100, 150, 0, 'USD']])
    const { legs } = await parseExcelBuffer(buf)
    expect(legs[0].side).toBe('SELL')
  })

  it('normalizes side SHORT to SELL', async () => {
    const buf = await makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'SHORT', 100, 150, 0, 'USD']])
    const { legs } = await parseExcelBuffer(buf)
    expect(legs[0].side).toBe('SELL')
  })

  it('treats unknown side as BUY', async () => {
    const buf = await makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'HOLD', 100, 150, 0, 'USD']])
    const { legs } = await parseExcelBuffer(buf)
    expect(legs[0].side).toBe('BUY')
  })

  it('skips row with empty ticker and records a warning', async () => {
    const buf = await makeBuffer([HEADER, ['2026-01-15', '09:30', '', 'BUY', 100, 150, 0, 'USD']])
    const { legs, errors } = await parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.some(e => e.toLowerCase().includes('ticker'))).toBe(true)
  })

  it('skips row with zero quantity and records a warning', async () => {
    const buf = await makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'BUY', 0, 150, 0, 'USD']])
    const { legs, errors } = await parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('skips row with zero price and records a warning', async () => {
    const buf = await makeBuffer([HEADER, ['2026-01-15', '09:30', 'AAPL', 'BUY', 100, 0, 0, 'USD']])
    const { legs, errors } = await parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('returns error when required column is missing', async () => {
    const badHeader = ['date', 'time', 'side', 'quantity', 'price', 'commission', 'currency'] // no ticker
    const buf = await makeBuffer([badHeader, ROW1.slice(1)])
    const { legs, errors } = await parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.some(e => e.toLowerCase().includes('ticker'))).toBe(true)
  })

  it('accepts Hebrew header aliases', async () => {
    const hebrewHeader = ['תאריך', 'שעה', 'טיקר', 'צד', 'כמות', 'מחיר', 'עמ', 'מטבע']
    const buf = await makeBuffer([hebrewHeader, ROW1])
    const { legs, errors } = await parseExcelBuffer(buf)
    expect(errors).toHaveLength(0)
    expect(legs).toHaveLength(1)
    expect(legs[0].ticker).toBe('AAPL')
  })

  it('defaults missing commission to 0', async () => {
    const noCommHeader = ['date', 'time', 'ticker', 'side', 'quantity', 'price', 'currency']
    const noCommRow = ['2026-01-15', '09:30', 'AAPL', 'BUY', 100, 150, 'USD']
    const buf = await makeBuffer([noCommHeader, noCommRow])
    const { legs } = await parseExcelBuffer(buf)
    expect(legs[0]?.commission ?? 0).toBe(0)
  })

  it('returns error for empty sheet', async () => {
    const buf = await makeBuffer([[]])
    const { legs, errors } = await parseExcelBuffer(buf)
    expect(legs).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe('generateTemplate', () => {
  it('returns a valid xlsx buffer with example row', async () => {
    const buf = await generateTemplate()
    expect(buf).toBeTruthy()
    expect(buf.byteLength).toBeGreaterThan(0)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets).toHaveLength(1)
    const sheet = wb.worksheets[0]
    // Header on row 1, example on row 2 → rowCount = 2
    expect(sheet.rowCount).toBe(2)
    // Locate the ticker column in the header and read row 2's value
    const header = sheet.getRow(1)
    let tickerCol = -1
    for (let c = 1; c <= sheet.columnCount; c++) {
      if (String(header.getCell(c).value).trim().toLowerCase() === 'ticker') {
        tickerCol = c
        break
      }
    }
    expect(tickerCol).toBeGreaterThan(0)
    expect(String(sheet.getRow(2).getCell(tickerCol).value)).toBe('AAPL')
  })

  it('template can be re-parsed by parseExcelBuffer', async () => {
    const buf = await generateTemplate()
    const { legs, errors } = await parseExcelBuffer(buf)
    expect(errors).toHaveLength(0)
    expect(legs).toHaveLength(1)
    expect(legs[0].side).toBe('BUY')
  })
})
