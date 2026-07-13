/**
 * Route-level tests for the two manual-close endpoints:
 *   - POST /api/trades/[id]/close          (close a previously-opened manual trade)
 *   - POST /api/trades/manual/closed       (open + close in one submission)
 *
 * Supabase clients are mocked so the tests run without a DB. The real FIFO →
 * DB write path is covered by __tests__/integration/fifo-to-db.test.ts; here
 * we cover the validation routing (status 401/403/409/422/500) and the
 * happy-path response shape after the route's pipeline completes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Module-level mocks. Reset per-test via vi.mocked(...).mockImplementation. ──

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/ibkr/process-executions', () => ({
  processExecutions: vi.fn(),
}))

vi.mock('@/lib/trade/recompute-actual-r', () => ({
  recomputeActualR: vi.fn(async () => undefined),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processExecutions } from '@/lib/ibkr/process-executions'

import { POST as closeManualTrade } from '@/app/api/trades/[id]/close/route'
import { POST as openAndCloseManual } from '@/app/api/trades/manual/closed/route'

const TEST_USER_ID = 'u-test-001'
const TEST_TRADE_ID = 'trade-001'

// Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/trades/' + TEST_TRADE_ID + '/close', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function setAuthOk() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: TEST_USER_ID } }, error: null }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function setAuthFail() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

interface MockTrade {
  id: string
  userId: string
  ticker: string
  direction: 'Long' | 'Short'
  status: 'Open' | 'Closed'
  source: 'manual' | 'broker'
  totalQuantity: number
  stopPrice: number | null
  targetPrice: number | null
  notes: string | null
}

function setAdminWithTrade(trade: MockTrade | null, openingBroker: string | null = 'IBKR') {
  const tradeBuilder = {
    select: () => tradeBuilder,
    eq: () => tradeBuilder,
    maybeSingle: async () => ({ data: trade, error: null }),
    update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
  }
  // P11: close route reads the opening Order's broker to inherit it onto the
  // closing Order. Mock returns that broker; test can pass null to simulate a
  // legacy pre-P11 row.
  const orderBuilder = {
    select: () => orderBuilder,
    eq: () => orderBuilder,
    order: () => orderBuilder,
    limit: () => orderBuilder,
    maybeSingle: async () => ({ data: openingBroker != null ? { broker: openingBroker } : null, error: null }),
    insert: async () => ({ error: null }),
  }
  vi.mocked(createAdminClient).mockReturnValue({
    from: (tbl: string) => (tbl === 'Trade' ? tradeBuilder : orderBuilder),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

// Reusable valid payload for the [id]/close route
const validClose = {
  closePrice: 152.5,
  closeDate: '2026-05-01',
  closeTime: '15:30',
  closeCommission: 1,
  closeReason: 'other' as const,
}

const openTrade: MockTrade = {
  id: TEST_TRADE_ID,
  userId: TEST_USER_ID,
  ticker: 'AAPL',
  direction: 'Long',
  status: 'Open',
  source: 'manual',
  totalQuantity: 100,
  stopPrice: 145,
  targetPrice: 170,
  notes: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: processExecutions returns PROCESSED.
  vi.mocked(processExecutions).mockResolvedValue([
    { brokerExecId: 'MANUAL-CLOSE-x', status: 'PROCESSED', tradeId: TEST_TRADE_ID },
  ])
})

// ─── POST /api/trades/[id]/close ─────────────────────────────────────────────

describe('POST /api/trades/[id]/close', () => {
  it('returns 401 when not authenticated', async () => {
    setAuthFail()
    const res = await closeManualTrade(makeRequest(validClose), {
      params: Promise.resolve({ id: TEST_TRADE_ID }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    setAuthOk()
    const req = new NextRequest('http://localhost/x', {
      method: 'POST',
      body: '{not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await closeManualTrade(req, { params: Promise.resolve({ id: TEST_TRADE_ID }) })
    expect(res.status).toBe(400)
  })

  it('returns 422 when closePrice ≤ 0', async () => {
    setAuthOk()
    const res = await closeManualTrade(makeRequest({ ...validClose, closePrice: 0 }), {
      params: Promise.resolve({ id: TEST_TRADE_ID }),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/closePrice/)
  })

  it('returns 422 for malformed closeDate', async () => {
    setAuthOk()
    const res = await closeManualTrade(
      makeRequest({ ...validClose, closeDate: '2026/05/01' }),
      { params: Promise.resolve({ id: TEST_TRADE_ID }) },
    )
    expect(res.status).toBe(422)
  })

  it('returns 422 for malformed closeTime', async () => {
    setAuthOk()
    const res = await closeManualTrade(
      makeRequest({ ...validClose, closeTime: '3:30' }),
      { params: Promise.resolve({ id: TEST_TRADE_ID }) },
    )
    expect(res.status).toBe(422)
  })

  it('returns 422 for unknown closeReason', async () => {
    setAuthOk()
    const res = await closeManualTrade(
      makeRequest({ ...validClose, closeReason: 'HOLD' }),
      { params: Promise.resolve({ id: TEST_TRADE_ID }) },
    )
    expect(res.status).toBe(422)
  })

  it('returns 422 for modified_stop without modifiedStopPrice', async () => {
    setAuthOk()
    const res = await closeManualTrade(
      makeRequest({ ...validClose, closeReason: 'modified_stop' }),
      { params: Promise.resolve({ id: TEST_TRADE_ID }) },
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/modifiedStopPrice/)
  })

  it('returns 404 when the trade does not exist', async () => {
    setAuthOk()
    setAdminWithTrade(null)
    const res = await closeManualTrade(makeRequest(validClose), {
      params: Promise.resolve({ id: 'unknown' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 403 when closing an IBKR-source trade', async () => {
    setAuthOk()
    setAdminWithTrade({ ...openTrade, source: 'broker' })
    const res = await closeManualTrade(makeRequest(validClose), {
      params: Promise.resolve({ id: TEST_TRADE_ID }),
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/manual/i)
  })

  it('returns 409 when the trade is already Closed', async () => {
    setAuthOk()
    setAdminWithTrade({ ...openTrade, status: 'Closed' })
    const res = await closeManualTrade(makeRequest(validClose), {
      params: Promise.resolve({ id: TEST_TRADE_ID }),
    })
    expect(res.status).toBe(409)
  })

  it('returns 422 for original_stop when trade has no stopPrice', async () => {
    setAuthOk()
    setAdminWithTrade({ ...openTrade, stopPrice: null })
    const res = await closeManualTrade(
      makeRequest({ ...validClose, closeReason: 'original_stop' }),
      { params: Promise.resolve({ id: TEST_TRADE_ID }) },
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/original_stop/)
  })

  it('returns 422 for target when trade has no targetPrice', async () => {
    setAuthOk()
    setAdminWithTrade({ ...openTrade, targetPrice: null })
    const res = await closeManualTrade(
      makeRequest({ ...validClose, closeReason: 'target' }),
      { params: Promise.resolve({ id: TEST_TRADE_ID }) },
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/target/)
  })

  it('happy path: returns 200 with tradeId for a valid close', async () => {
    setAuthOk()
    setAdminWithTrade(openTrade)
    const res = await closeManualTrade(makeRequest(validClose), {
      params: Promise.resolve({ id: TEST_TRADE_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.tradeId).toBe(TEST_TRADE_ID)
  })

  it('returns 500 when processExecutions fails', async () => {
    setAuthOk()
    setAdminWithTrade(openTrade)
    vi.mocked(processExecutions).mockResolvedValue([
      { brokerExecId: 'MANUAL-CLOSE-x', status: 'FAILED', error: 'boom' },
    ])
    const res = await closeManualTrade(makeRequest(validClose), {
      params: Promise.resolve({ id: TEST_TRADE_ID }),
    })
    expect(res.status).toBe(500)
  })
})

// ─── POST /api/trades/manual/closed ──────────────────────────────────────────

const validOpenLeg = {
  ticker: 'AAPL',
  date: '2026-05-01',
  time: '09:30',
  side: 'BUY' as const,
  quantity: 100,
  price: 150,
  commission: 1,
  currency: 'USD',
  stopPrice: 145,
  targetPrice: 170,
}

function makeOpenAndCloseRequest(open: unknown, close: unknown): NextRequest {
  return new NextRequest('http://localhost/api/trades/manual/closed', {
    method: 'POST',
    body: JSON.stringify({ open, close }),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/trades/manual/closed', () => {
  beforeEach(() => {
    // Default: admin client lets all writes succeed (we are not testing FIFO).
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({
        update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  it('returns 401 when not authenticated', async () => {
    setAuthFail()
    const res = await openAndCloseManual(makeOpenAndCloseRequest(validOpenLeg, validClose))
    expect(res.status).toBe(401)
  })

  it('returns 400 when open or close is missing', async () => {
    setAuthOk()
    const res = await openAndCloseManual(makeOpenAndCloseRequest(validOpenLeg, null))
    expect(res.status).toBe(400)
  })

  it('returns 422 for closePrice ≤ 0', async () => {
    setAuthOk()
    const res = await openAndCloseManual(
      makeOpenAndCloseRequest(validOpenLeg, { ...validClose, closePrice: -5 }),
    )
    expect(res.status).toBe(422)
  })

  it('returns 422 for original_stop when open leg has no stopPrice', async () => {
    setAuthOk()
    const { stopPrice: _strip, ...openWithoutStop } = validOpenLeg
    void _strip
    const res = await openAndCloseManual(
      makeOpenAndCloseRequest(openWithoutStop, { ...validClose, closeReason: 'original_stop' }),
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/original_stop/)
  })

  it('returns 422 for target when open leg has no targetPrice', async () => {
    setAuthOk()
    const { targetPrice: _strip, ...openWithoutTarget } = validOpenLeg
    void _strip
    const res = await openAndCloseManual(
      makeOpenAndCloseRequest(openWithoutTarget, { ...validClose, closeReason: 'target' }),
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/target/)
  })

  it('returns 422 for modified_stop without modifiedStopPrice', async () => {
    setAuthOk()
    const res = await openAndCloseManual(
      makeOpenAndCloseRequest(validOpenLeg, { ...validClose, closeReason: 'modified_stop' }),
    )
    expect(res.status).toBe(422)
  })

  it('happy path: returns 200 with tradeId', async () => {
    setAuthOk()
    const res = await openAndCloseManual(makeOpenAndCloseRequest(validOpenLeg, validClose))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.tradeId).toBe(TEST_TRADE_ID)
  })
})
