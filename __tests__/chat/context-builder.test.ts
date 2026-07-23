import { describe, it, expect } from 'vitest'
import {
  buildChatContext,
  projectTrade,
  CONTEXT_BUDGET_BYTES,
  type ChatTrade,
} from '@/lib/chat/context-builder'
import { calcStats } from '@/lib/utils/calculations'

function makeTrade(over: Partial<ChatTrade> & { id: string }): ChatTrade {
  return {
    ticker: 'AAPL',
    direction: 'Long',
    setupType: 'פריצה',
    openedAt: new Date('2026-03-02T14:30:00Z'),
    closedAt: new Date('2026-03-02T18:00:00Z'),
    actualR: 1.5,
    realizedPnl: 300,
    avgEntryPrice: 100,
    avgExitPrice: 103,
    stopPrice: 98,
    totalQuantityOpened: 100,
    result: 'Win',
    executionQuality: 8,
    emotionalState: 'רגוע',
    ...over,
  }
}

// Spread over distinct close times so "most recent first" truncation is testable.
function makeMany(n: number): ChatTrade[] {
  return Array.from({ length: n }, (_, i) =>
    makeTrade({
      id: `t${i}`,
      ticker: `TCK${i}`,
      closedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      openedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i - 1)),
    }),
  )
}

describe('projectTrade — per-mode field gate', () => {
  const t = makeTrade({ id: 'a' })

  it('smart mode exposes exactly the 7 spec fields', () => {
    expect(Object.keys(projectTrade(t, 'smart')).sort()).toEqual(
      ['actualR', 'closedAt', 'direction', 'realizedPnl', 'result', 'setup', 'ticker'],
    )
  })

  it('smart mode withholds openedAt, executionQuality and emotionalState', () => {
    const p = projectTrade(t, 'smart') as Record<string, unknown>
    expect(p.openedAt).toBeUndefined()
    expect(p.executionQuality).toBeUndefined()
    expect(p.emotionalState).toBeUndefined()
  })

  it('smart mode includes realizedPnl (P1-A)', () => {
    expect((projectTrade(t, 'smart') as Record<string, unknown>).realizedPnl).toBe(300)
  })

  it('full mode adds openedAt, executionQuality and emotionalState', () => {
    expect(Object.keys(projectTrade(t, 'full')).sort()).toEqual(
      [
        'actualR', 'closedAt', 'direction', 'emotionalState', 'executionQuality',
        'openedAt', 'realizedPnl', 'result', 'setup', 'ticker',
      ],
    )
  })

  it('neither mode ever exposes free-text or raw price columns', () => {
    for (const mode of ['smart', 'full'] as const) {
      const keys = Object.keys(projectTrade(t, mode))
      for (const forbidden of ['notes', 'didRight', 'wouldChange', 'avgEntryPrice', 'stopPrice', 'id']) {
        expect(keys).not.toContain(forbidden)
      }
    }
  })
})

describe('buildChatContext — below the budget', () => {
  const trades = makeMany(5)
  const result = buildChatContext({
    trades,
    mode: 'smart',
    stats: calcStats(trades),
    filterActive: false,
  })

  it('includes every trade and does not flag the threshold', () => {
    expect(result.overThreshold).toBe(false)
    expect(result.includedCount).toBe(5)
    expect(result.totalCount).toBe(5)
  })

  it('emits a parseable JSON array of rows', () => {
    const json = result.contextString.slice(result.contextString.lastIndexOf('\n[') + 1)
    expect(JSON.parse(json)).toHaveLength(5)
  })

  it('does not emit a truncation warning', () => {
    expect(result.contextString).not.toContain('מגבלת גודל')
  })

  it('reports full-history scope when no filter is active', () => {
    expect(result.contextString).toContain('כל היסטוריית הטריידים הסגורים')
  })

  it('reports filtered scope when a filter is active', () => {
    const filtered = buildChatContext({
      trades, mode: 'smart', stats: calcStats(trades), filterActive: true,
    })
    expect(filtered.contextString).toContain('מסונן לפי המסננים הפעילים')
  })
})

describe('buildChatContext — above the budget', () => {
  const trades = makeMany(400)
  const budget = 4 * 1024
  const result = buildChatContext({
    trades,
    mode: 'smart',
    stats: calcStats(trades),
    filterActive: false,
    budgetBytes: budget,
  })

  it('flags the threshold and truncates', () => {
    expect(result.overThreshold).toBe(true)
    expect(result.includedCount).toBeGreaterThan(0)
    expect(result.includedCount).toBeLessThan(400)
    expect(result.totalCount).toBe(400)
  })

  it('keeps the serialized rows within the budget', () => {
    const json = result.contextString.slice(result.contextString.lastIndexOf('\n[') + 1)
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(budget)
  })

  it('keeps the most recently closed trades, newest first', () => {
    const json = result.contextString.slice(result.contextString.lastIndexOf('\n[') + 1)
    const rows = JSON.parse(json) as Array<{ ticker: string }>
    expect(rows[0].ticker).toBe('TCK399')
    expect(rows[1].ticker).toBe('TCK398')
  })

  it('tells the model to state its scope', () => {
    expect(result.contextString).toContain('מגבלת גודל')
    expect(result.contextString).toContain('ציין במפורש על איזה היקף התבססת')
  })

  it('still reports KPIs over the whole in-scope set, not the truncated window', () => {
    expect(result.contextString).toContain('מחושבים על כל 400 הטריידים')
  })
})

describe('buildChatContext — omitRows (tool-driven turn)', () => {
  const trades = makeMany(400)
  const result = buildChatContext({
    trades,
    mode: 'full',
    stats: calcStats(trades),
    filterActive: false,
    omitRows: true,
  })

  it('sends no rows at all', () => {
    expect(result.includedCount).toBe(0)
    expect(result.contextString).not.toContain('TCK399')
  })

  it('still reports the true scope and the KPI baseline', () => {
    expect(result.totalCount).toBe(400)
    expect(result.contextString).toContain('טריידים סגורים בהיקף: 400')
    expect(result.contextString).toContain('"totalTrades":400')
  })

  it('points the model at the tools instead of at a truncated window', () => {
    expect(result.contextString).toContain('השתמש בכלים')
    expect(result.contextString).not.toContain('שנסגרו לאחרונה בלבד')
  })

  it('reports overThreshold from the full set, not from what it sent', () => {
    expect(result.overThreshold).toBe(true)
    expect(result.totalBytes).toBeGreaterThan(CONTEXT_BUDGET_BYTES)
  })

  it('omits rows even for a small set when asked', () => {
    const small = makeMany(3)
    const r = buildChatContext({
      trades: small, mode: 'smart', stats: calcStats(small), filterActive: false, omitRows: true,
    })
    expect(r.includedCount).toBe(0)
    expect(r.overThreshold).toBe(false)
  })
})

describe('buildChatContext — budget boundary', () => {
  it('full mode crosses the threshold at a lower trade count than smart', () => {
    const trades = makeMany(300)
    const stats = calcStats(trades)
    const smart = buildChatContext({ trades, mode: 'smart', stats, filterActive: false })
    const full = buildChatContext({ trades, mode: 'full', stats, filterActive: false })
    expect(full.totalBytes).toBeGreaterThan(smart.totalBytes)
  })

  it('defaults to the 60 KB budget', () => {
    expect(CONTEXT_BUDGET_BYTES).toBe(61440)
    const trades = makeMany(50)
    const result = buildChatContext({
      trades, mode: 'smart', stats: calcStats(trades), filterActive: false,
    })
    expect(result.totalBytes).toBeLessThan(CONTEXT_BUDGET_BYTES)
    expect(result.overThreshold).toBe(false)
  })

  it('handles an empty trade set without throwing', () => {
    const result = buildChatContext({
      trades: [], mode: 'full', stats: calcStats([]), filterActive: true,
    })
    expect(result.totalCount).toBe(0)
    expect(result.includedCount).toBe(0)
    expect(result.overThreshold).toBe(false)
    expect(result.contextString).toContain('[]')
  })
})
