/**
 * Integration test: FIFO logic → Supabase DB round trip.
 * Skipped automatically if SUPABASE_SERVICE_ROLE_KEY is not set.
 *
 * Runs against the real Supabase DB — cleans up after itself.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { matchExecution } from '@/lib/trade/fifo'
import type { NormalizedExecution } from '@/types/trade'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/db/types'

const DB_AVAILABLE =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY

// The public.User table has a FK to auth.users(id), so the test user must
// first exist as a Supabase auth identity before we can insert the app row.
// We create it via the service-role admin API in beforeAll and tear it down
// in afterAll. The id is fixed so cleanup is idempotent across reruns.
const TEST_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const TEST_EMAIL = 'integration-test@example.com'
const TEST_PASSWORD = 'integration-test-pw-' + TEST_USER_ID

const baseExec: NormalizedExecution = {
  brokerExecId: 'INT-EXEC-001',
  brokerOrderId: 'INT-ORDER-001',
  ticker: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 150.5,
  commission: 1.0,
  executedAt: new Date('2026-04-23T14:30:00Z'),
  currency: 'USD',
  rawPayload: { source: 'integration-test' },
}

describe.skipIf(!DB_AVAILABLE)('FIFO → DB integration', () => {
  const supabase = DB_AVAILABLE ? createAdminClient() : null!

  async function cleanup() {
    // App-table rows first (FK on userId → User.id), then the app User row
    // (FK id → auth.users.id), then the auth identity itself.
    await supabase.from('Order').delete().eq('userId', TEST_USER_ID)
    await supabase.from('Trade').delete().eq('userId', TEST_USER_ID)
    await supabase.from('User').delete().eq('id', TEST_USER_ID)
    // deleteUser returns { error: { name: 'AuthApiError', status: 404 } } when
    // the user is already gone — that's fine, swallow it. Any other error we
    // ignore here too because cleanup runs in both before/after and we don't
    // want a stale-state failure to mask the real test result.
    await supabase.auth.admin.deleteUser(TEST_USER_ID).catch(() => {})
  }

  beforeAll(async () => {
    await cleanup()
    // 1. Create the auth identity with a fixed UUID so the FK target exists.
    const { error: authErr } = await supabase.auth.admin.createUser({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin API accepts id, types lag
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    } as Parameters<typeof supabase.auth.admin.createUser>[0] & { id: string })
    if (authErr) throw authErr
    // 2. Now the app-level User row can be inserted (FK satisfied).
    const { error } = await supabase
      .from('User')
      .insert({ id: TEST_USER_ID, email: TEST_EMAIL, settings: {} })
    if (error) throw error
  })

  afterAll(async () => {
    await cleanup()
  })

  it('OPEN Long: FIFO result persists as Trade + Order with correct values', async () => {
    const action = matchExecution(baseExec, null)
    expect(action.type).toBe('OPEN')
    if (action.type !== 'OPEN') return

    const { tradeCreate, orderCreate } = action

    const { data: trade, error: tErr } = await supabase
      .from('Trade')
      .insert({
        userId: TEST_USER_ID,
        ticker: tradeCreate.ticker,
        direction: tradeCreate.direction,
        status: tradeCreate.status,
        openedAt: tradeCreate.openedAt.toISOString(),
        avgEntryPrice: tradeCreate.avgEntryPrice,
        totalQuantity: tradeCreate.totalQuantity,
        totalQuantityOpened: tradeCreate.totalQuantityOpened,
        totalCommission: tradeCreate.totalCommission,
        realizedPnl: tradeCreate.realizedPnl,
      })
      .select('*')
      .single()
    expect(tErr).toBeNull()
    expect(trade).not.toBeNull()

    const { data: order, error: oErr } = await supabase
      .from('Order')
      .insert({
        tradeId: trade!.id,
        userId: TEST_USER_ID,
        side: orderCreate.side,
        quantity: orderCreate.quantity,
        price: orderCreate.price,
        commission: orderCreate.commission,
        executedAt: orderCreate.executedAt.toISOString(),
        brokerExecId: orderCreate.brokerExecId,
        brokerOrderId: orderCreate.brokerOrderId ?? null,
        rawPayload: orderCreate.rawPayload as Json,
      })
      .select('*')
      .single()
    expect(oErr).toBeNull()
    expect(order).not.toBeNull()

    expect(trade!.status).toBe('Open')
    expect(trade!.direction).toBe('Long')
    expect(trade!.ticker).toBe('AAPL')
    expect(Number(trade!.avgEntryPrice)).toBeCloseTo(150.5, 4)
    expect(Number(trade!.totalQuantity)).toBe(100)

    expect(order!.brokerExecId).toBe('INT-EXEC-001')
    expect(order!.side).toBe('BUY')
    expect(Number(order!.quantity)).toBe(100)
    expect(order!.tradeId).toBe(trade!.id)
    expect(order!.userId).toBe(TEST_USER_ID)

    // FK fetch — Trade with its Orders
    const { data: fetched } = await supabase
      .from('Trade')
      .select('*, Order(*)')
      .eq('id', trade!.id)
      .single()
    expect(fetched).not.toBeNull()
    expect(fetched!.Order).toHaveLength(1)
    expect(fetched!.Order[0].brokerExecId).toBe('INT-EXEC-001')
  })

  it('duplicate brokerExecId is rejected by unique constraint', async () => {
    const { data: trade } = await supabase
      .from('Trade').select('id').eq('userId', TEST_USER_ID).limit(1).single()
    if (!trade) return

    const { error } = await supabase.from('Order').insert({
      tradeId: trade.id,
      userId: TEST_USER_ID,
      side: 'BUY',
      quantity: 50,
      price: 150.5,
      commission: 0.5,
      executedAt: new Date().toISOString(),
      brokerExecId: 'INT-EXEC-001', // duplicate!
      rawPayload: {},
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505') // unique_violation
  })
})
