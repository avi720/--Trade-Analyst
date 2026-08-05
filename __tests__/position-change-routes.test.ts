/**
 * Route-level tests for the two position-change endpoints:
 *   - POST /api/trades/[id]/add-to-position   (scale into an open position)
 *   - POST /api/trades/[id]/reduce-position   (trim part of an open position)
 *
 * Supabase + processExecutions are mocked, same as close-routes.test.ts: what's
 * under test is the guard routing (401/403/404/409/422), the side chosen for the
 * execution, and the note appended to Trade.notes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/ibkr/process-executions', () => ({ processExecutions: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processExecutions } from '@/lib/ibkr/process-executions'

import { POST as addToPosition } from '@/app/api/trades/[id]/add-to-position/route'
import { POST as reducePosition } from '@/app/api/trades/[id]/reduce-position/route'

const TEST_USER_ID = 'u-test-002'
const TEST_TRADE_ID = 'trade-002'

interface MockTrade {
  id: string
  userId: string
  ticker: string
  direction: 'Long' | 'Short'
  status: 'Open' | 'Closed'
  source: 'manual' | 'broker'
  totalQuantity: number
  notes: string | null
}

const openLong: MockTrade = {
  id: TEST_TRADE_ID,
  userId: TEST_USER_ID,
  ticker: 'AAPL',
  direction: 'Long',
  status: 'Open',
  source: 'manual',
  totalQuantity: 100,
  notes: null,
}

/** Captures the Trade.update() payload so tests can assert on the note. */
let capturedTradeUpdate: Record<string, unknown> | null = null

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/trades/${TEST_TRADE_ID}/add-to-position`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = { params: Promise.resolve({ id: TEST_TRADE_ID }) }

function setAuthOk() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: TEST_USER_ID } }, error: null }) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function setAuthFail() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function setAdminWithTrade(trade: MockTrade | null) {
  const tradeBuilder = {
    select: () => tradeBuilder,
    eq: () => tradeBuilder,
    maybeSingle: async () => ({ data: trade, error: null }),
    update: (payload: Record<string, unknown>) => {
      capturedTradeUpdate = payload
      return { eq: () => ({ eq: async () => ({ error: null }) }) }
    },
  }
  const orderBuilder = {
    select: () => orderBuilder,
    eq: () => orderBuilder,
    order: () => orderBuilder,
    limit: () => orderBuilder,
    maybeSingle: async () => ({
      data: { broker: 'IBKR', currency: 'USD', commissionCurrency: 'USD' },
      error: null,
    }),
  }
  vi.mocked(createAdminClient).mockReturnValue({
    from: (tbl: string) => (tbl === 'Trade' ? tradeBuilder : orderBuilder),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

const validAdd = {
  quantity: 50,
  price: 155,
  commission: 1,
  date: '2026-08-05',
  time: '15:30',
  reason: 'הפוזיציה התנהגה כמצופה',
}

beforeEach(() => {
  vi.clearAllMocks()
  capturedTradeUpdate = null
  vi.mocked(processExecutions).mockResolvedValue([
    { brokerExecId: 'MANUAL-ADD-x', status: 'PROCESSED', tradeId: TEST_TRADE_ID },
  ])
})

// ─── Shared guards ─────────────────────────────────────────────────────────

describe('position-change guards (both routes)', () => {
  it('returns 401 when not authenticated', async () => {
    setAuthFail()
    const res = await addToPosition(makeRequest(validAdd), params)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the trade does not exist', async () => {
    setAuthOk(); setAdminWithTrade(null)
    const res = await addToPosition(makeRequest(validAdd), params)
    expect(res.status).toBe(404)
  })

  it('returns 403 for a broker-sourced trade', async () => {
    setAuthOk(); setAdminWithTrade({ ...openLong, source: 'broker' })
    const res = await addToPosition(makeRequest(validAdd), params)
    expect(res.status).toBe(403)
  })

  it('returns 409 for a closed trade', async () => {
    setAuthOk(); setAdminWithTrade({ ...openLong, status: 'Closed' })
    const res = await addToPosition(makeRequest(validAdd), params)
    expect(res.status).toBe(409)
  })

  it('returns 422 for a non-positive quantity', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    const res = await addToPosition(makeRequest({ ...validAdd, quantity: 0 }), params)
    expect(res.status).toBe(422)
  })

  it('returns 422 for a malformed date', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    const res = await addToPosition(makeRequest({ ...validAdd, date: '05/08/2026' }), params)
    expect(res.status).toBe(422)
  })

  it('surfaces a duplicate execution as 409 rather than silent success', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    vi.mocked(processExecutions).mockResolvedValue([
      { brokerExecId: 'MANUAL-ADD-x', status: 'SKIPPED_DUPLICATE' },
    ])
    const res = await addToPosition(makeRequest(validAdd), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('כבר נרשם')
  })
})

// ─── add-to-position ───────────────────────────────────────────────────────

describe('POST /api/trades/[id]/add-to-position', () => {
  it('sends a BUY execution for a long position', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    const res = await addToPosition(makeRequest(validAdd), params)
    expect(res.status).toBe(200)
    const [[execs]] = vi.mocked(processExecutions).mock.calls
    expect(execs[0]).toMatchObject({ side: 'BUY', quantity: 50, price: 155, ticker: 'AAPL' })
    expect(execs[0].brokerExecId).toMatch(/^MANUAL-ADD-/)
  })

  it('sends a SELL execution for a short position', async () => {
    setAuthOk(); setAdminWithTrade({ ...openLong, direction: 'Short' })
    await addToPosition(makeRequest(validAdd), params)
    const [[execs]] = vi.mocked(processExecutions).mock.calls
    expect(execs[0].side).toBe('SELL')
  })

  it('appends the fixed-prefix note with the modal date', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    await addToPosition(makeRequest(validAdd), params)
    expect(capturedTradeUpdate?.notes).toBe(
      'בתאריך 05/08/2026 הוספתי כסף לפוזיציה כי הפוזיציה התנהגה כמצופה'
    )
  })

  it('appends onto existing notes on a new line', async () => {
    setAuthOk(); setAdminWithTrade({ ...openLong, notes: 'הערה קודמת' })
    await addToPosition(makeRequest(validAdd), params)
    expect(capturedTradeUpdate?.notes).toBe(
      'הערה קודמת\nבתאריך 05/08/2026 הוספתי כסף לפוזיציה כי הפוזיציה התנהגה כמצופה'
    )
  })

  it('writes no note at all when the reason is blank', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    const res = await addToPosition(makeRequest({ ...validAdd, reason: '   ' }), params)
    expect(res.status).toBe(200)
    expect((await res.json()).noteAdded).toBe(false)
    expect(capturedTradeUpdate).toBeNull()
  })

  it('inherits broker and currency from the opening order', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    await addToPosition(makeRequest(validAdd), params)
    const [[execs]] = vi.mocked(processExecutions).mock.calls
    expect(execs[0]).toMatchObject({ broker: 'IBKR', currency: 'USD' })
  })
})

// ─── reduce-position ───────────────────────────────────────────────────────

describe('POST /api/trades/[id]/reduce-position', () => {
  it('sends a SELL execution for a long position', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    const res = await reducePosition(makeRequest({ ...validAdd, quantity: 30 }), params)
    expect(res.status).toBe(200)
    const [[execs]] = vi.mocked(processExecutions).mock.calls
    expect(execs[0]).toMatchObject({ side: 'SELL', quantity: 30 })
    expect(execs[0].brokerExecId).toMatch(/^MANUAL-REDUCE-/)
  })

  it('sends a BUY execution for a short position', async () => {
    setAuthOk(); setAdminWithTrade({ ...openLong, direction: 'Short' })
    await reducePosition(makeRequest({ ...validAdd, quantity: 30 }), params)
    const [[execs]] = vi.mocked(processExecutions).mock.calls
    expect(execs[0].side).toBe('BUY')
  })

  it('rejects selling the whole open quantity — that is a close', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    const res = await reducePosition(makeRequest({ ...validAdd, quantity: 100 }), params)
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('סגירת טרייד')
    expect(processExecutions).not.toHaveBeenCalled()
  })

  it('rejects selling more than is open — that would be a reversal', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    const res = await reducePosition(makeRequest({ ...validAdd, quantity: 150 }), params)
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('פתוחות רק 100')
    expect(processExecutions).not.toHaveBeenCalled()
  })

  it('uses the reduce wording in the note', async () => {
    setAuthOk(); setAdminWithTrade(openLong)
    await reducePosition(makeRequest({ ...validAdd, quantity: 30, reason: 'לקחתי רווח חלקי' }), params)
    expect(capturedTradeUpdate?.notes).toBe(
      'בתאריך 05/08/2026 מכרתי חלק מהפוזיציה כי לקחתי רווח חלקי'
    )
  })
})
