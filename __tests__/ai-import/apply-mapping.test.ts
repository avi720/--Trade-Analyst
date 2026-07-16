import { describe, it, expect } from 'vitest'
import { applyMapping } from '@/lib/trade/ai-import/apply-mapping'
import type { MappingResult, Transformations, ColumnMap } from '@/lib/trade/ai-import/types'

function mapping(
  columnMap: ColumnMap,
  transformations: Partial<Transformations> = {},
  overrides: Partial<MappingResult> = {},
): MappingResult {
  return {
    mode: 'mapping',
    sheetName: 'Sheet1',
    headerRowIndex: 0,
    dataStartRowIndex: 1,
    columnMap,
    transformations: {
      dateFormat: 'iso',
      timeFormat: 'HH:mm',
      sideEncoding: 'text',
      sideMap: { buy: [], sell: [] },
      defaultCurrency: 'USD',
      ...transformations,
    },
    confidence: 0.9,
    notes: '',
    ...overrides,
  }
}

describe('applyMapping', () => {
  it('maps a simple flat table (iso date, HH:mm, text side)', () => {
    const rows: unknown[][] = [
      ['Date', 'Time', 'Symbol', 'Action', 'Qty', 'Price', 'Comm', 'Ccy'],
      ['2026-01-15', '09:30', 'AAPL', 'BUY', 100, 150.5, 1.0, 'USD'],
      ['2026-01-16', '10:00', 'msft', 'SELL', 50, 400, 0.5, 'usd'],
    ]
    const { legs, errors } = applyMapping(
      rows,
      mapping({ date: 0, time: 1, ticker: 2, side: 3, quantity: 4, price: 5, commission: 6, currency: 7 }),
    )
    expect(errors).toEqual([])
    expect(legs).toHaveLength(2)
    expect(legs[0]).toMatchObject({
      ticker: 'AAPL', date: '2026-01-15', time: '09:30', side: 'BUY',
      quantity: 100, price: 150.5, commission: 1, currency: 'USD',
    })
    expect(legs[1]).toMatchObject({ ticker: 'MSFT', side: 'SELL', currency: 'USD' })
  })

  it('parses excel-serial dates', () => {
    // 46037 = 2026-01-15 in Excel serial (base 1899-12-30)
    const rows: unknown[][] = [
      ['d', 't', 's', 'side', 'q', 'p'],
      [46037, '09:30', 'AAPL', 'BUY', 10, 100],
    ]
    const { legs } = applyMapping(
      rows,
      mapping(
        { date: 0, time: 1, ticker: 2, side: 3, quantity: 4, price: 5 },
        { dateFormat: 'excel-serial' },
      ),
    )
    expect(legs[0].date).toBe('2026-01-15')
  })

  it('derives side from signed quantity and takes absolute value', () => {
    const rows: unknown[][] = [
      ['d', 's', 'q', 'p'],
      ['2026-01-15', 'AAPL', -25, 100],
      ['2026-01-15', 'AAPL', 25, 100],
    ]
    const { legs } = applyMapping(
      rows,
      mapping(
        { date: 0, ticker: 1, quantity: 2, price: 3 },
        { sideEncoding: 'signed-quantity' },
      ),
    )
    expect(legs[0]).toMatchObject({ side: 'SELL', quantity: 25 })
    expect(legs[1]).toMatchObject({ side: 'BUY', quantity: 25 })
  })

  it('honours a custom sideMap and MM/dd/yyyy dates', () => {
    const rows: unknown[][] = [
      ['d', 's', 'dir', 'q', 'p'],
      ['01/15/2026', 'AAPL', 'Long', 10, 100],
      ['01/16/2026', 'AAPL', 'Short', 10, 110],
    ]
    const { legs } = applyMapping(
      rows,
      mapping(
        { date: 0, ticker: 1, side: 2, quantity: 3, price: 4 },
        { dateFormat: 'MM/dd/yyyy', sideMap: { buy: ['Long'], sell: ['Short'] } },
      ),
    )
    expect(legs[0]).toMatchObject({ date: '2026-01-15', side: 'BUY' })
    expect(legs[1]).toMatchObject({ date: '2026-01-16', side: 'SELL' })
  })

  it('strips currency symbols and thousands separators from numbers', () => {
    const rows: unknown[][] = [
      ['d', 's', 'side', 'q', 'p', 'c'],
      ['2026-01-15', 'AAPL', 'BUY', '1,000', '$1,250.75', '$2.50'],
    ]
    const { legs } = applyMapping(
      rows,
      mapping({ date: 0, ticker: 1, side: 2, quantity: 3, price: 4, commission: 5 }),
    )
    expect(legs[0]).toMatchObject({ quantity: 1000, price: 1250.75, commission: 2.5 })
  })

  it('skips blank rows and records errors for unusable rows', () => {
    const rows: unknown[][] = [
      ['d', 's', 'side', 'q', 'p'],
      ['2026-01-15', 'AAPL', 'BUY', 10, 100],
      ['', '', '', '', ''],            // blank → skipped silently
      ['2026-01-15', '', 'BUY', 10, 100],   // missing ticker → error
      ['2026-01-15', 'AAPL', 'BUY', 0, 100], // non-positive qty → error
      ['bad-date', 'AAPL', 'BUY', 10, 100],  // unparseable date → error
    ]
    const { legs, errors } = applyMapping(
      rows,
      mapping({ date: 0, ticker: 1, side: 2, quantity: 3, price: 4 }),
    )
    expect(legs).toHaveLength(1)
    expect(errors).toHaveLength(3)
    expect(errors.map((e) => e.rowIndex).sort()).toEqual([3, 4, 5])
  })

  it('falls back to defaultCurrency when the currency cell is unknown', () => {
    const rows: unknown[][] = [
      ['d', 's', 'side', 'q', 'p', 'ccy'],
      ['2026-01-15', 'AAPL', 'BUY', 10, 100, 'DOGE'],
    ]
    const { legs } = applyMapping(
      rows,
      mapping(
        { date: 0, ticker: 1, side: 2, quantity: 3, price: 4, currency: 5 },
        { defaultCurrency: 'ILS' },
      ),
    )
    expect(legs[0].currency).toBe('ILS')
  })
})
