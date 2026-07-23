import { describe, it, expect, vi } from 'vitest'
import { queryTradesTool, type QueryTradesResult } from '@/lib/chat/tools/query-trades'
import type { ChatContextMode, ChatTrade } from '@/lib/chat/context-builder'
import type { FetchFreeText, ToolContext, TradeFreeText } from '@/lib/chat/tools/types'
import { QUERY_TRADES_DEFAULT_LIMIT, QUERY_TRADES_MAX_LIMIT } from '@/lib/chat/tools/types'
import type { ResearchAggregates } from '@/lib/utils/research-aggregate'

function makeTrade(over: Partial<ChatTrade> & { id: string }): ChatTrade {
  return {
    ticker: 'AAPL',
    direction: 'Long',
    setupType: 'פריצה',
    openedAt: new Date('2026-01-01T09:00:00Z'),
    closedAt: new Date('2026-01-01T10:00:00Z'),
    actualR: 1,
    realizedPnl: 100,
    avgEntryPrice: 100,
    avgExitPrice: 103,
    stopPrice: 98,
    totalQuantityOpened: 100,
    result: 'Win',
    executionQuality: 7,
    emotionalState: 'רגוע',
    ...over,
  }
}

// Five deliberately heterogeneous rows — every filter and every orderBy has a
// discriminating value here, including a null actualR.
const TRADES: ChatTrade[] = [
  makeTrade({
    id: 't1', ticker: 'AAPL', direction: 'Long', setupType: 'פריצה',
    actualR: 2, realizedPnl: 400, result: 'Win', executionQuality: 8, emotionalState: 'רגוע',
    openedAt: new Date('2026-01-01T09:00:00Z'), closedAt: new Date('2026-01-01T10:00:00Z'),
  }),
  makeTrade({
    id: 't2', ticker: 'MSFT', direction: 'Short', setupType: 'ריטרייס',
    actualR: -1, realizedPnl: -150, result: 'Loss', executionQuality: 5, emotionalState: 'לחוץ',
    openedAt: new Date('2026-01-02T09:00:00Z'), closedAt: new Date('2026-01-02T10:00:00Z'),
  }),
  makeTrade({
    id: 't3', ticker: 'AAPL', direction: 'Long', setupType: 'פריצה',
    actualR: null, realizedPnl: 50, result: 'Win', executionQuality: null, emotionalState: null,
    openedAt: new Date('2026-01-03T08:00:00Z'), closedAt: new Date('2026-01-03T10:00:00Z'),
  }),
  makeTrade({
    id: 't4', ticker: 'TSLA', direction: 'Short', setupType: 'דגל',
    actualR: 0.5, realizedPnl: 20, result: 'Breakeven', executionQuality: 6, emotionalState: 'רגוע',
    openedAt: new Date('2026-01-04T09:30:00Z'), closedAt: new Date('2026-01-04T10:00:00Z'),
  }),
  makeTrade({
    id: 't5', ticker: 'NVDA', direction: 'Long', setupType: 'דגל',
    actualR: 3, realizedPnl: 900, result: 'Win', executionQuality: 9, emotionalState: 'בטוח',
    openedAt: new Date('2026-01-05T09:00:00Z'), closedAt: new Date('2026-01-05T10:00:00Z'),
  }),
]

function makeMany(n: number): ChatTrade[] {
  return Array.from({ length: n }, (_, i) =>
    makeTrade({
      id: `m${i}`,
      ticker: `TCK${i}`,
      closedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      openedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i - 1)),
    }),
  )
}

function makeCtx(
  trades: ChatTrade[],
  mode: ChatContextMode,
  fetchFreeText: FetchFreeText = async () => new Map<string, TradeFreeText>(),
): ToolContext {
  return {
    trades,
    mode,
    fetchFreeText,
    // Not exercised by queryTrades — the aggregation tools own this.
    aggregates: () => ({}) as ResearchAggregates,
  }
}

function run(
  args: Record<string, unknown>,
  mode: ChatContextMode = 'full',
  trades: ChatTrade[] = TRADES,
  fetchFreeText?: FetchFreeText,
): Promise<QueryTradesResult> {
  return Promise.resolve(
    queryTradesTool.execute(args, makeCtx(trades, mode, fetchFreeText)),
  ) as Promise<QueryTradesResult>
}

const ids = (r: QueryTradesResult) => r.rows.map(row => row.ticker)

describe('queryTradesTool — declaration', () => {
  it('is named queryTrades and offered in both modes', () => {
    expect(queryTradesTool.name).toBe('queryTrades')
    expect(queryTradesTool.declaration.name).toBe('queryTrades')
    expect([...queryTradesTool.modes].sort()).toEqual(['full', 'smart'])
  })

  it('declares the documented parameter surface', () => {
    const props = queryTradesTool.declaration.parameters?.properties ?? {}
    expect(Object.keys(props).sort()).toEqual(
      ['direction', 'fields', 'filters', 'limit', 'offset', 'orderBy'],
    )
  })
})

describe('queryTradesTool — limit clamping', () => {
  it('defaults to QUERY_TRADES_DEFAULT_LIMIT', async () => {
    const r = await run({}, 'full', makeMany(200))
    expect(QUERY_TRADES_DEFAULT_LIMIT).toBe(20)
    expect(r.limit).toBe(QUERY_TRADES_DEFAULT_LIMIT)
    expect(r.returned).toBe(QUERY_TRADES_DEFAULT_LIMIT)
  })

  it('clamps an oversized limit to the cap instead of honouring it', async () => {
    const r = await run({ limit: 5000 }, 'full', makeMany(200))
    expect(r.limit).toBe(QUERY_TRADES_MAX_LIMIT)
    expect(r.returned).toBe(150)
    expect(r.hasMore).toBe(true)
  })

  it('clamps limit 0 up to 1', async () => {
    const r = await run({ limit: 0 })
    expect(r.limit).toBe(1)
    expect(r.returned).toBe(1)
  })

  it('clamps a negative offset up to 0', async () => {
    const r = await run({ offset: -10, limit: 2 })
    expect(r.offset).toBe(0)
    expect(ids(r)).toEqual(['NVDA', 'TSLA'])
  })
})

describe('queryTradesTool — pagination', () => {
  it('paginates with offset', async () => {
    const p1 = await run({ limit: 2, offset: 0 })
    const p2 = await run({ limit: 2, offset: 2 })
    expect(ids(p1)).toEqual(['NVDA', 'TSLA'])
    expect(ids(p2)).toEqual(['AAPL', 'MSFT'])
    expect(p1.hasMore).toBe(true)
    expect(p2.hasMore).toBe(true)
  })

  it('flips hasMore false on the last page', async () => {
    const last = await run({ limit: 2, offset: 4 })
    expect(last.returned).toBe(1)
    expect(last.hasMore).toBe(false)
  })

  it('adds a scope note only while more rows remain', async () => {
    expect((await run({ limit: 2 })).note).toContain('offset')
    expect((await run({ limit: 150 })).note).toBeUndefined()
  })

  it('reports matched over the filter and totalInScope over the whole set', async () => {
    const r = await run({ filters: { ticker: 'AAPL' }, limit: 1 })
    expect(r.matched).toBe(2)
    expect(r.totalInScope).toBe(5)
    expect(r.returned).toBe(1)
  })
})

describe('queryTradesTool — filters', () => {
  it('matches ticker as a case-insensitive substring', async () => {
    expect((await run({ filters: { ticker: 'aap' } })).matched).toBe(2)
    expect((await run({ filters: { ticker: 'SF' } })).matched).toBe(1)
    expect((await run({ filters: { ticker: 'ZZZ' } })).matched).toBe(0)
  })

  it('filters by direction, result and setup exactly', async () => {
    expect((await run({ filters: { direction: 'Short' } })).matched).toBe(2)
    expect((await run({ filters: { result: 'Win' } })).matched).toBe(3)
    expect((await run({ filters: { setup: 'דגל' } })).matched).toBe(2)
    expect((await run({ filters: { setup: 'דג' } })).matched).toBe(0)
  })

  it('filters by emotionalState in full mode', async () => {
    expect((await run({ filters: { emotionalState: 'רגוע' } })).matched).toBe(2)
  })

  it('never lets a null actualR satisfy an R filter', async () => {
    const min = await run({ filters: { minR: -99 } })
    expect(min.matched).toBe(4)
    expect(min.rows.map(r => r.actualR)).not.toContain(null)
    const max = await run({ filters: { maxR: 99 } })
    expect(max.matched).toBe(4)
  })

  it('applies minR / maxR as inclusive bounds', async () => {
    expect((await run({ filters: { minR: 2 } })).matched).toBe(2)
    expect((await run({ filters: { maxR: 0.5 } })).matched).toBe(2)
    expect((await run({ filters: { minR: 0.5, maxR: 2 } })).matched).toBe(2)
  })

  it('filters by realizedPnl range', async () => {
    expect((await run({ filters: { minPnl: 0 } })).matched).toBe(4)
    expect((await run({ filters: { maxPnl: 50 } })).matched).toBe(3)
    expect((await run({ filters: { minPnl: 20, maxPnl: 400 } })).matched).toBe(3)
  })

  it('treats closedFrom / closedTo as inclusive of the bounds', async () => {
    const exact = await run({
      filters: { closedFrom: '2026-01-02T10:00:00Z', closedTo: '2026-01-04T10:00:00Z' },
    })
    expect(exact.matched).toBe(3)
    // A bare date covers the whole UTC day, so a 10:00 close is still inside it.
    const dateOnly = await run({ filters: { closedFrom: '2026-01-04', closedTo: '2026-01-04' } })
    expect(ids(dateOnly)).toEqual(['TSLA'])
  })

  it('treats openedFrom / openedTo as inclusive of the bounds', async () => {
    const r = await run({ filters: { openedFrom: '2026-01-03T08:00:00Z', openedTo: '2026-01-04T09:30:00Z' } })
    expect(ids(r)).toEqual(['TSLA', 'AAPL'])
  })

  it('combines filters conjunctively', async () => {
    const r = await run({ filters: { direction: 'Long', minR: 2.5 } })
    expect(ids(r)).toEqual(['NVDA'])
  })
})

describe('queryTradesTool — ordering', () => {
  it('defaults to closedAt desc', async () => {
    const r = await run({})
    expect(ids(r)).toEqual(['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AAPL'])
    expect(r.rows[0].closedAt).toBe('2026-01-05T10:00:00.000Z')
  })

  it('orders by closedAt asc', async () => {
    expect(ids(await run({ orderBy: 'closedAt', direction: 'asc' })))
      .toEqual(['AAPL', 'MSFT', 'AAPL', 'TSLA', 'NVDA'])
  })

  it('orders by openedAt in both directions (full mode)', async () => {
    expect(ids(await run({ orderBy: 'openedAt', direction: 'asc' })))
      .toEqual(['AAPL', 'MSFT', 'AAPL', 'TSLA', 'NVDA'])
    expect(ids(await run({ orderBy: 'openedAt', direction: 'desc' })))
      .toEqual(['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AAPL'])
  })

  it('orders by realizedPnl in both directions', async () => {
    expect((await run({ orderBy: 'realizedPnl', direction: 'desc' })).rows.map(r => r.realizedPnl))
      .toEqual([900, 400, 50, 20, -150])
    expect((await run({ orderBy: 'realizedPnl', direction: 'asc' })).rows.map(r => r.realizedPnl))
      .toEqual([-150, 20, 50, 400, 900])
  })

  it('orders by ticker alphabetically and stably', async () => {
    const asc = await run({ orderBy: 'ticker', direction: 'asc' })
    expect(ids(asc)).toEqual(['AAPL', 'AAPL', 'MSFT', 'NVDA', 'TSLA'])
    // Ties keep source order: t1 (R=2) precedes t3 (R=null).
    expect(asc.rows[0].actualR).toBe(2)
    expect(asc.rows[1].actualR).toBeNull()
    expect(ids(await run({ orderBy: 'ticker', direction: 'desc' })))
      .toEqual(['TSLA', 'NVDA', 'MSFT', 'AAPL', 'AAPL'])
  })

  it('puts null actualR last in both directions', async () => {
    expect((await run({ orderBy: 'actualR', direction: 'desc' })).rows.map(r => r.actualR))
      .toEqual([3, 2, 0.5, -1, null])
    expect((await run({ orderBy: 'actualR', direction: 'asc' })).rows.map(r => r.actualR))
      .toEqual([-1, 0.5, 2, 3, null])
  })

  it('falls back to closedAt desc for an unknown orderBy', async () => {
    expect(ids(await run({ orderBy: 'nonsense' })))
      .toEqual(['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AAPL'])
  })
})

describe('queryTradesTool — smart-mode gate', () => {
  it('drops the full-only fields from a requested field list and reports them', async () => {
    const r = await run(
      { fields: ['ticker', 'openedAt', 'executionQuality', 'emotionalState', 'notes'], limit: 1 },
      'smart',
    )
    expect((r.droppedFields ?? []).sort())
      .toEqual(['emotionalState', 'executionQuality', 'notes', 'openedAt'])
    expect(r.note).toContain('Pro')
  })

  it('genuinely omits the dropped keys from the returned row objects', async () => {
    const r = await run(
      { fields: ['ticker', 'openedAt', 'executionQuality', 'emotionalState', 'notes', 'didRight', 'wouldChange'], limit: 5 },
      'smart',
    )
    for (const row of r.rows) {
      expect(Object.keys(row)).toEqual(['ticker'])
      for (const forbidden of ['openedAt', 'executionQuality', 'emotionalState', 'notes', 'didRight', 'wouldChange']) {
        expect(row).not.toHaveProperty(forbidden)
      }
    }
  })

  it('defaults smart rows to the 7 allowed non-free-text fields', async () => {
    const r = await run({ limit: 1 }, 'smart')
    expect(Object.keys(r.rows[0]).sort())
      .toEqual(['actualR', 'closedAt', 'direction', 'realizedPnl', 'result', 'setup', 'ticker'])
  })

  it('ignores an emotionalState filter in smart mode', async () => {
    const r = await run({ filters: { emotionalState: 'רגוע' } }, 'smart')
    expect(r.matched).toBe(5)
    expect(r.droppedFields).toContain('emotionalState')
  })

  it('ignores openedFrom / openedTo filters in smart mode', async () => {
    const r = await run({ filters: { openedFrom: '2026-01-04T00:00:00Z' } }, 'smart')
    expect(r.matched).toBe(5)
    expect(r.droppedFields).toContain('openedAt')
  })

  it('rejects orderBy openedAt in smart mode and falls back to closedAt', async () => {
    const r = await run({ orderBy: 'openedAt', direction: 'asc' }, 'smart')
    expect(ids(r)).toEqual(['AAPL', 'MSFT', 'AAPL', 'TSLA', 'NVDA'])
    expect(r.droppedFields).toContain('openedAt')
  })

  it('falls back to the default fields when every requested field is forbidden', async () => {
    const r = await run({ fields: ['notes', 'emotionalState'], limit: 1 }, 'smart')
    expect(Object.keys(r.rows[0]).sort())
      .toEqual(['actualR', 'closedAt', 'direction', 'realizedPnl', 'result', 'setup', 'ticker'])
  })

  it('never throws on forbidden input', async () => {
    await expect(
      run({ fields: ['notes'], filters: { emotionalState: 'x' }, orderBy: 'openedAt' }, 'smart'),
    ).resolves.toBeTruthy()
  })
})

describe('queryTradesTool — full mode', () => {
  it('returns every non-free-text field by default', async () => {
    const r = await run({ limit: 1 }, 'full')
    expect(Object.keys(r.rows[0]).sort()).toEqual([
      'actualR', 'closedAt', 'direction', 'emotionalState', 'executionQuality',
      'openedAt', 'realizedPnl', 'result', 'setup', 'ticker',
    ])
    expect(r.droppedFields).toBeUndefined()
  })

  it('honours an explicit full-only field list', async () => {
    const r = await run({ fields: ['ticker', 'openedAt', 'executionQuality', 'emotionalState'], limit: 1 }, 'full')
    expect(r.rows[0]).toEqual({
      ticker: 'NVDA',
      openedAt: '2026-01-05T09:00:00.000Z',
      executionQuality: 9,
      emotionalState: 'בטוח',
    })
  })
})

describe('queryTradesTool — free text', () => {
  it('is not fetched when it was not requested', async () => {
    const spy = vi.fn<FetchFreeText>(async () => new Map())
    const r = await run({ limit: 2 }, 'full', TRADES, spy)
    expect(spy).not.toHaveBeenCalled()
    expect(r.rows[0]).not.toHaveProperty('notes')
  })

  it('is never fetched in smart mode even when requested', async () => {
    const spy = vi.fn<FetchFreeText>(async () => new Map())
    await run({ fields: ['ticker', 'notes'], limit: 2 }, 'smart', TRADES, spy)
    expect(spy).not.toHaveBeenCalled()
  })

  it('is fetched for exactly the returned page ids, not every match', async () => {
    const spy = vi.fn<FetchFreeText>(async () => new Map())
    await run({ fields: ['ticker', 'notes'], limit: 2 }, 'full', TRADES, spy)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(['t5', 't4'])
  })

  it('merges the fetched values and nulls the rows that had no entry', async () => {
    const spy = vi.fn<FetchFreeText>(async () => new Map<string, TradeFreeText>([
      ['t5', { notes: 'הערה', didRight: 'המתנה', wouldChange: null }],
    ]))
    const r = await run(
      { fields: ['ticker', 'notes', 'didRight', 'wouldChange'], limit: 2 },
      'full', TRADES, spy,
    )
    expect(r.rows[0]).toEqual({ ticker: 'NVDA', notes: 'הערה', didRight: 'המתנה', wouldChange: null })
    expect(r.rows[1]).toEqual({ ticker: 'TSLA', notes: null, didRight: null, wouldChange: null })
  })

  it('skips the fetch when the page is empty', async () => {
    const spy = vi.fn<FetchFreeText>(async () => new Map())
    const r = await run({ fields: ['ticker', 'notes'], filters: { ticker: 'ZZZ' } }, 'full', TRADES, spy)
    expect(spy).not.toHaveBeenCalled()
    expect(r.rows).toEqual([])
  })
})

describe('queryTradesTool — empty scope', () => {
  it('returns an empty result without throwing', async () => {
    const r = await run({}, 'full', [])
    expect(r.rows).toEqual([])
    expect(r.returned).toBe(0)
    expect(r.matched).toBe(0)
    expect(r.totalInScope).toBe(0)
    expect(r.hasMore).toBe(false)
    expect(r.note).toBeUndefined()
  })

  it('reports hasMore false when an offset lands past the end', async () => {
    const r = await run({ offset: 99 })
    expect(r.rows).toEqual([])
    expect(r.matched).toBe(5)
    expect(r.hasMore).toBe(false)
  })
})
