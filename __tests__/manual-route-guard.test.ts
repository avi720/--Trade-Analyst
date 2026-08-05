/**
 * Route-level tests for the "opening only" guard on POST /api/trades/manual.
 *
 * The manual-entry tab may open positions and scale into positions it opened in
 * the same submission — nothing else. Anything that touches a position that
 * already existed, or that closes/reduces a position opened within the batch,
 * is rejected all-or-nothing (422) before a single write.
 *
 * Supabase + the persistence pipeline are mocked; the guard's own FIFO
 * simulation is covered by __tests__/guard-position-mutations.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

vi.mock('@/lib/trade/persist-manual-legs', () => ({
  persistManualLegs: vi.fn(async () => ({
    processed: 1, skipped: 0, failed: 0, errors: [], validationErrors: [],
  })),
}))

vi.mock('@/lib/billing/tier', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/tier')>('@/lib/billing/tier')
  return {
    ...actual,
    getUserTier: vi.fn(async () => ({ tier: 'Pro' as const })),
    getUserTradeCount: vi.fn(async () => 0),
  }
})

import { createClient } from '@/lib/supabase/server'
import { persistManualLegs } from '@/lib/trade/persist-manual-legs'
import { POST as manualEntry } from '@/app/api/trades/manual/route'

const TEST_USER_ID = 'u-guard-001'

interface OpenRow {
  id: string
  ticker: string
  direction: 'Long' | 'Short'
  avgEntryPrice: number
  totalQuantity: number
  totalQuantityOpened: number
  totalCommission: number | null
  realizedPnl: number | null
  openedAt: string
  stopPrice: number | null
}

function openLongRow(ticker: string, quantity = 100): OpenRow {
  return {
    id: `trade-${ticker}`,
    ticker,
    direction: 'Long',
    avgEntryPrice: 140,
    totalQuantity: quantity,
    totalQuantityOpened: quantity,
    totalCommission: 1,
    realizedPnl: 0,
    openedAt: '2026-04-22T09:30:00Z',
    stopPrice: 130,
  }
}

/** Auth OK + `from('Trade')` resolving to the given open positions. */
function setSupabase(openRows: OpenRow[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: async () => ({ data: openRows, error: null }),
  }
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: TEST_USER_ID } }, error: null }) },
    from: () => builder,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function leg(overrides: Record<string, unknown> = {}) {
  return {
    ticker: 'AAPL',
    date: '2026-04-23',
    time: '14:30',
    side: 'BUY',
    quantity: 100,
    price: 150,
    commission: 1,
    currency: 'USD',
    ...overrides,
  }
}

function makeRequest(legs: unknown[]): NextRequest {
  return new NextRequest('http://localhost/api/trades/manual', {
    method: 'POST',
    body: JSON.stringify({ legs }),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/trades/manual — opening-only guard', () => {
  it('accepts a plain open when no position exists', async () => {
    setSupabase([])
    const res = await manualEntry(makeRequest([leg()]))
    expect(res.status).toBe(200)
    expect(persistManualLegs).toHaveBeenCalledOnce()
  })

  it('accepts multi-leg entry (open + scale-in within the batch)', async () => {
    setSupabase([])
    const res = await manualEntry(makeRequest([leg(), leg({ quantity: 50, time: '14:35' })]))
    expect(res.status).toBe(200)
    expect(persistManualLegs).toHaveBeenCalledOnce()
  })

  it('accepts opening a short when nothing is open on that ticker', async () => {
    setSupabase([])
    const res = await manualEntry(makeRequest([leg({ side: 'SELL' })]))
    expect(res.status).toBe(200)
  })

  it('rejects a SELL that would close an existing long — nothing is written', async () => {
    setSupabase([openLongRow('AAPL')])
    const res = await manualEntry(makeRequest([leg({ side: 'SELL' })]))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.legErrors).toHaveLength(1)
    expect(body.legErrors[0]).toContain('חיפוש')
    expect(body.forbiddenLegs[0]).toMatchObject({ action: 'CLOSE', reason: 'EXISTING_POSITION' })
    expect(persistManualLegs).not.toHaveBeenCalled()
  })

  it('rejects a BUY that would scale into an existing long', async () => {
    setSupabase([openLongRow('AAPL')])
    const res = await manualEntry(makeRequest([leg()]))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.forbiddenLegs[0]).toMatchObject({ action: 'SCALE_IN', reason: 'EXISTING_POSITION' })
    expect(body.legErrors[0]).toContain('הוספה לפוזיציה')
    expect(persistManualLegs).not.toHaveBeenCalled()
  })

  it('rejects a batch that closes itself (BUY 100 + SELL 100)', async () => {
    setSupabase([])
    const res = await manualEntry(makeRequest([
      leg(),
      leg({ side: 'SELL', time: '15:30' }),
    ]))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.forbiddenLegs).toHaveLength(1)
    expect(body.forbiddenLegs[0]).toMatchObject({ index: 1, reason: 'CLOSES_WITHIN_BATCH' })
    expect(persistManualLegs).not.toHaveBeenCalled()
  })

  it('rejects the whole batch when only one leg offends (all-or-nothing)', async () => {
    setSupabase([openLongRow('TSLA')])
    const res = await manualEntry(makeRequest([
      leg({ ticker: 'AAPL' }),
      leg({ ticker: 'TSLA', side: 'SELL' }),
    ]))
    expect(res.status).toBe(422)
    expect(persistManualLegs).not.toHaveBeenCalled()
  })

  it('lets an unrelated ticker through while another has an open position', async () => {
    setSupabase([openLongRow('TSLA')])
    const res = await manualEntry(makeRequest([leg({ ticker: 'MSFT' })]))
    expect(res.status).toBe(200)
    expect(persistManualLegs).toHaveBeenCalledOnce()
  })
})
