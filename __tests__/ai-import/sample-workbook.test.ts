import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  sampleWorkbook,
  MAX_TOTAL_ROWS,
  RowCapExceededError,
  EmptyWorkbookError,
} from '@/lib/trade/ai-import/sample-workbook'

async function toBuffer(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const buf = await wb.xlsx.writeBuffer()
  return buf as ArrayBuffer
}

describe('sampleWorkbook', () => {
  it('returns dense rows and merged ranges for each sheet', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Trades')
    ws.addRow(['My Broker Statement', '', ''])
    ws.mergeCells('A1:C1') // a title band across the top → merged range
    ws.addRow(['Date', 'Ticker', 'Qty'])
    ws.addRow(['2026-01-15', 'AAPL', 100])

    const sample = await sampleWorkbook(await toBuffer(wb))

    expect(sample.sheets).toHaveLength(1)
    const sheet = sample.sheets[0]
    expect(sheet.name).toBe('Trades')
    expect(sheet.mergedRanges).toContain('A1:C1')
    // Row 3 (0-indexed 2) has the data
    expect(sheet.rows[2]).toEqual(['2026-01-15', 'AAPL', 100])
    expect(sample.totalRowCount).toBe(3)
  })

  it('unwraps formula and rich-text cells to primitives', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S')
    const row = ws.addRow([null, null])
    row.getCell(1).value = { formula: 'A1', result: 42 } as ExcelJS.CellValue
    row.getCell(2).value = { richText: [{ text: 'AA' }, { text: 'PL' }] } as ExcelJS.CellValue

    const sample = await sampleWorkbook(await toBuffer(wb))
    expect(sample.sheets[0].rows[0]).toEqual([42, 'AAPL'])
  })

  it('throws EmptyWorkbookError when there are no rows', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Empty')
    await expect(sampleWorkbook(await toBuffer(wb))).rejects.toBeInstanceOf(EmptyWorkbookError)
  })

  it('throws RowCapExceededError past the ceiling', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Big')
    for (let i = 0; i < MAX_TOTAL_ROWS + 1; i++) ws.addRow([i])
    await expect(sampleWorkbook(await toBuffer(wb))).rejects.toBeInstanceOf(RowCapExceededError)
  })
})
