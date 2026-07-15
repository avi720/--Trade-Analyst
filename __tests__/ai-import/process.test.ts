import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { processWorkbook } from '@/lib/trade/ai-import/process'
import type { GeminiCall } from '@/lib/trade/ai-import/extract'

const noDelay = async () => {}

async function xlsx(rows: unknown[][], sheetName = 'Sheet1'): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  rows.forEach((r) => ws.addRow(r))
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

describe('processWorkbook', () => {
  it('mapping mode → applies mapping, injects timezone, validates', async () => {
    const buf = await xlsx([
      ['Date', 'Ticker', 'Side', 'Qty', 'Price'],
      ['2026-01-15', 'AAPL', 'BUY', 100, 150],
      ['2026-01-16', 'MSFT', 'SELL', 50, 400],
    ])
    const call: GeminiCall = vi.fn(async () =>
      JSON.stringify({
        mode: 'mapping',
        sheetName: 'Sheet1',
        headerRowIndex: 0,
        dataStartRowIndex: 1,
        columnMap: { date: 0, ticker: 1, side: 2, quantity: 3, price: 4 },
        transformations: {
          dateFormat: 'iso',
          timeFormat: null,
          sideEncoding: 'text',
          sideMap: { buy: ['BUY'], sell: ['SELL'] },
          defaultCurrency: 'USD',
        },
        confidence: 0.95,
        notes: 'ok',
      }),
    )

    const res = await processWorkbook(buf, 'America/New_York', { call, delayFn: noDelay })
    expect(res.aiMapping.mode).toBe('mapping')
    expect(res.rowCountRaw).toBe(3)
    expect(res.extractedLegs).toHaveLength(2)
    expect(res.extractedLegs.every((l) => l.timezone === 'America/New_York')).toBe(true)
    expect(res.extractedLegs[0]).toMatchObject({ ticker: 'AAPL', side: 'BUY', quantity: 100 })
    expect(res.parseErrors).toEqual([])
  })

  it('extraction mode → uses AI legs directly and injects timezone', async () => {
    const buf = await xlsx([
      ['Statement'],
      ['AAPL bought 100 @ 150 on 2026-01-15'],
    ])
    const call: GeminiCall = vi.fn(async () =>
      JSON.stringify({
        mode: 'extraction',
        legs: [
          { ticker: 'AAPL', date: '2026-01-15', time: '09:30', side: 'BUY', quantity: 100, price: 150, currency: 'USD' },
        ],
        confidence: 0.8,
        notes: 'complex sheet',
        rowsCovered: 1,
      }),
    )

    const res = await processWorkbook(buf, 'UTC', { call, delayFn: noDelay })
    expect(res.aiMapping.mode).toBe('extraction')
    expect(res.extractedLegs).toHaveLength(1)
    expect(res.extractedLegs[0]).toMatchObject({ ticker: 'AAPL', timezone: 'UTC' })
  })
})
