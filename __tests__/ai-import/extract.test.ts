import { describe, it, expect, vi } from 'vitest'
import { extract, type GeminiCall } from '@/lib/trade/ai-import/extract'
import type { WorkbookSample } from '@/lib/trade/ai-import/types'

const noDelay = async () => {}

function sampleWith(rows: unknown[][]): WorkbookSample {
  return {
    sheets: [{ name: 'Sheet1', rows, mergedRanges: [] }],
    totalRowCount: rows.length,
  }
}

const flatMappingJson = JSON.stringify({
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
  notes: 'flat table',
})

function extractionJson(legs: unknown[], confidence = 0.9, rowsCovered = legs.length) {
  return JSON.stringify({ mode: 'extraction', legs, confidence, notes: 'complex', rowsCovered })
}

const oneLeg = { ticker: 'AAPL', date: '2026-01-15', time: '09:30', side: 'BUY', quantity: 10, price: 100 }

describe('extract', () => {
  it('returns a validated mapping result', async () => {
    const call: GeminiCall = vi.fn(async () => flatMappingJson)
    const res = await extract(sampleWith([['h'], ['x']]), { call, delayFn: noDelay })
    expect(res.mode).toBe('mapping')
    if (res.mode === 'mapping') expect(res.columnMap.ticker).toBe(1)
  })

  it('returns an extraction result with legs', async () => {
    const call: GeminiCall = vi.fn(async () => extractionJson([oneLeg]))
    const res = await extract(sampleWith([['x']]), { call, delayFn: noDelay })
    expect(res.mode).toBe('extraction')
    if (res.mode === 'extraction') expect(res.legs).toHaveLength(1)
  })

  it('strips ```json code fences before parsing', async () => {
    const call: GeminiCall = vi.fn(async () => '```json\n' + flatMappingJson + '\n```')
    const res = await extract(sampleWith([['h'], ['x']]), { call, delayFn: noDelay })
    expect(res.mode).toBe('mapping')
  })

  it('retries on invalid JSON then succeeds', async () => {
    const call: GeminiCall = vi
      .fn()
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce(flatMappingJson)
    const res = await extract(sampleWith([['h'], ['x']]), { call, delayFn: noDelay })
    expect(res.mode).toBe('mapping')
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('retries on a timeout error', async () => {
    const call: GeminiCall = vi
      .fn()
      .mockRejectedValueOnce(new Error('gemini_timeout'))
      .mockResolvedValueOnce(flatMappingJson)
    const res = await extract(sampleWith([['h'], ['x']]), { call, delayFn: noDelay })
    expect(res.mode).toBe('mapping')
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('upgrades to pro when flash confidence is below the floor', async () => {
    const call: GeminiCall = vi.fn(async ({ model }) => {
      const conf = model === 'gemini-2.5-pro' ? 0.95 : 0.3
      return JSON.stringify({ ...JSON.parse(flatMappingJson), confidence: conf })
    })
    const res = await extract(sampleWith([['h'], ['x']]), { call, delayFn: noDelay })
    expect(res.confidence).toBe(0.95)
    const models = (call as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].model)
    expect(models).toContain('gemini-2.5-pro')
  })

  it('chunks a large sheet when extraction under-covers, merging + deduping legs', async () => {
    const rows: unknown[][] = Array.from({ length: 6 }, (_, i) => [`row${i}`])
    const call: GeminiCall = vi.fn(async ({ userPrompt }) => {
      if (userPrompt.includes('slice')) {
        // Each chunk returns the same single leg → dedup should collapse them.
        return extractionJson([oneLeg])
      }
      // Full pass: extraction that only covered 1 of 6 rows.
      return extractionJson([oneLeg], 0.9, 1)
    })
    const res = await extract(sampleWith(rows), { call, delayFn: noDelay, chunkSize: 3 })
    expect(res.mode).toBe('extraction')
    if (res.mode === 'extraction') {
      expect(res.legs).toHaveLength(1) // deduped
    }
    // full call + at least one chunk call
    expect((call as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1)
  })

  it('throws when every attempt fails', async () => {
    const call: GeminiCall = vi.fn(async () => 'garbage')
    await expect(
      extract(sampleWith([['x']]), { call, delayFn: noDelay, retries: 1 }),
    ).rejects.toThrow()
  })
})
