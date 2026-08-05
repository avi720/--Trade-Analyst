import { describe, it, expect } from 'vitest'
import {
  findForbiddenLegs,
  forbiddenLegMessage,
  snapshotsByTicker,
  type OpenSnapshotsByTicker,
  type OpenTradeRow,
} from '@/lib/trade/guard-position-mutations'
import type { NormalizedExecution, OpenTradeSnapshot } from '@/types/trade'

const NOW = new Date('2026-04-23T14:30:00Z')

let seq = 0
function exec(
  side: NormalizedExecution['side'],
  overrides: Partial<NormalizedExecution> = {},
): NormalizedExecution {
  return {
    brokerExecId: `MANUAL-${++seq}`,
    ticker: 'AAPL',
    assetClass: 'STK',
    side,
    quantity: 100,
    price: 150,
    commission: 1,
    executedAt: NOW,
    ...overrides,
  }
}

function openLong(overrides: Partial<OpenTradeSnapshot> = {}): OpenTradeSnapshot {
  return {
    id: 'trade-1',
    direction: 'Long',
    avgEntryPrice: 140,
    totalQuantity: 100,
    totalQuantityOpened: 100,
    totalCommission: 1,
    realizedPnl: 0,
    openedAt: new Date('2026-04-22T09:30:00Z'),
    stopPrice: 130,
    ...overrides,
  }
}

function withOpen(ticker: string, snapshot: OpenTradeSnapshot): OpenSnapshotsByTicker {
  return new Map([[ticker, snapshot]])
}

const NONE: OpenSnapshotsByTicker = new Map()

// ─── Allowed: pure opens ───────────────────────────────────────────────────

describe('findForbiddenLegs — allowed', () => {
  it('allows a single BUY that opens a new long', () => {
    expect(findForbiddenLegs([exec('BUY')], NONE)).toEqual([])
  })

  it('allows a single SELL that opens a new short (no existing position)', () => {
    expect(findForbiddenLegs([exec('SELL')], NONE)).toEqual([])
  })

  it('allows multi-leg entry — first leg opens, rest scale in within the batch', () => {
    const legs = [exec('BUY'), exec('BUY', { quantity: 50 }), exec('BUY', { quantity: 25 })]
    expect(findForbiddenLegs(legs, NONE)).toEqual([])
  })

  it('allows scaling into a short opened within the same batch', () => {
    const legs = [exec('SELL'), exec('SELL', { quantity: 40 })]
    expect(findForbiddenLegs(legs, NONE)).toEqual([])
  })

  it('allows independent tickers in one batch', () => {
    const legs = [exec('BUY'), exec('SELL', { ticker: 'TSLA' }), exec('BUY', { ticker: 'MSFT' })]
    expect(findForbiddenLegs(legs, NONE)).toEqual([])
  })

  it('ignores open positions in unrelated tickers', () => {
    const legs = [exec('BUY', { ticker: 'TSLA' })]
    expect(findForbiddenLegs(legs, withOpen('AAPL', openLong()))).toEqual([])
  })
})

// ─── Rejected: acting on a pre-existing position ───────────────────────────

describe('findForbiddenLegs — pre-existing position', () => {
  it('rejects a SELL that closes an existing long', () => {
    const found = findForbiddenLegs([exec('SELL')], withOpen('AAPL', openLong()))
    expect(found).toEqual([
      { index: 0, ticker: 'AAPL', action: 'CLOSE', reason: 'EXISTING_POSITION' },
    ])
  })

  it('rejects a SELL that partially reduces an existing long', () => {
    const found = findForbiddenLegs([exec('SELL', { quantity: 40 })], withOpen('AAPL', openLong()))
    expect(found[0]).toMatchObject({ action: 'REDUCE', reason: 'EXISTING_POSITION' })
  })

  it('rejects a SELL larger than the existing long (reversal)', () => {
    const found = findForbiddenLegs([exec('SELL', { quantity: 250 })], withOpen('AAPL', openLong()))
    expect(found[0]).toMatchObject({ action: 'REVERSAL', reason: 'EXISTING_POSITION' })
  })

  it('rejects a BUY that scales into an existing long (version B)', () => {
    const found = findForbiddenLegs([exec('BUY')], withOpen('AAPL', openLong()))
    expect(found[0]).toMatchObject({ action: 'SCALE_IN', reason: 'EXISTING_POSITION' })
  })

  it('rejects a BUY that covers an existing short', () => {
    const short = openLong({ direction: 'Short', avgEntryPrice: 160, stopPrice: 170 })
    const found = findForbiddenLegs([exec('BUY')], withOpen('AAPL', short))
    expect(found[0]).toMatchObject({ action: 'CLOSE', reason: 'EXISTING_POSITION' })
  })

  it('matches tickers case-insensitively', () => {
    const found = findForbiddenLegs([exec('SELL', { ticker: 'aapl' })], withOpen('AAPL', openLong()))
    expect(found).toHaveLength(1)
  })
})

// ─── Rejected: batch that closes itself ────────────────────────────────────

describe('findForbiddenLegs — self-closing batch', () => {
  it('rejects BUY 100 + SELL 100 on the same ticker in one submission', () => {
    const found = findForbiddenLegs([exec('BUY'), exec('SELL')], NONE)
    expect(found).toEqual([
      { index: 1, ticker: 'AAPL', action: 'CLOSE', reason: 'CLOSES_WITHIN_BATCH' },
    ])
  })

  it('rejects a partial sell of a position opened in the same submission', () => {
    const found = findForbiddenLegs([exec('BUY'), exec('SELL', { quantity: 30 })], NONE)
    expect(found[0]).toMatchObject({ index: 1, action: 'REDUCE', reason: 'CLOSES_WITHIN_BATCH' })
  })

  it('rejects a reversal within the batch', () => {
    const found = findForbiddenLegs([exec('BUY'), exec('SELL', { quantity: 300 })], NONE)
    expect(found[0]).toMatchObject({ index: 1, action: 'REVERSAL', reason: 'CLOSES_WITHIN_BATCH' })
  })

  it('reports every offending leg, ordered by input index', () => {
    const legs = [
      exec('BUY'),                              // 0 — OPEN, ok
      exec('BUY', { ticker: 'TSLA' }),          // 1 — OPEN, ok
      exec('SELL'),                             // 2 — closes AAPL
      exec('SELL', { ticker: 'TSLA' }),         // 3 — closes TSLA
    ]
    const found = findForbiddenLegs(legs, NONE)
    expect(found.map(f => f.index)).toEqual([2, 3])
  })

  it('treats a re-open after a forbidden close as a fresh position, not pre-existing', () => {
    // SELL closes the DB trade (rejected), the following BUY then opens anew (allowed).
    const legs = [exec('SELL'), exec('BUY')]
    const found = findForbiddenLegs(legs, withOpen('AAPL', openLong()))
    expect(found.map(f => f.index)).toEqual([0])
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────

describe('snapshotsByTicker', () => {
  it('normalises the ticker key and coerces nullable numerics', () => {
    const rows: OpenTradeRow[] = [{
      id: 't1',
      ticker: ' aapl ',
      direction: 'Long',
      avgEntryPrice: 140,
      totalQuantity: 100,
      totalQuantityOpened: 100,
      totalCommission: null,
      realizedPnl: null,
      openedAt: '2026-04-22T09:30:00Z',
      stopPrice: null,
    }]
    const map = snapshotsByTicker(rows)
    expect(map.has('AAPL')).toBe(true)
    expect(map.get('AAPL')).toMatchObject({ totalCommission: 0, realizedPnl: 0, stopPrice: null })
  })
})

describe('forbiddenLegMessage', () => {
  it('points a scale-in at the add-to-position modal', () => {
    const msg = forbiddenLegMessage({ index: 0, ticker: 'AAPL', action: 'SCALE_IN', reason: 'EXISTING_POSITION' })
    expect(msg).toContain('כרטיס 1 (AAPL)')
    expect(msg).toContain('הוספה לפוזיציה')
  })

  it('points a close at the search tab', () => {
    const msg = forbiddenLegMessage({ index: 2, ticker: 'TSLA', action: 'CLOSE', reason: 'CLOSES_WITHIN_BATCH' })
    expect(msg).toContain('כרטיס 3 (TSLA)')
    expect(msg).toContain('חיפוש')
  })
})
