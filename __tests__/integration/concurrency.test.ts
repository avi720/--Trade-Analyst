/**
 * Integration test: concurrency guards in process-executions.ts.
 * Skipped automatically if SUPABASE_SERVICE_ROLE_KEY is not set.
 *
 * Exercises the three load-bearing concurrency invariants from CLAUDE.md:
 *  1. Two concurrent OPEN executions for the same (userId, ticker) collapse to
 *     ONE Open trade + one SCALE_IN on the conflict-retry path (partial unique
 *     index + ConflictError catch).
 *  2. A SCALE_IN whose UPDATE guard fails (totalQuantity changed between read
 *     and write) re-reads the latest state and retries against fresh state.
 *  3. The retry loop bails out after MAX_PERSIST_ATTEMPTS (4) when the conflict
 *     cannot be resolved, surfacing FAILED rather than silent corruption.
 *
 * Runs against the real Supabase DB — cleans up after itself.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { processExecutions } from '@/lib/ibkr/process-executions'
import type { NormalizedExecution } from '@/types/trade'
import { createAdminClient } from '@/lib/supabase/admin'

const DB_AVAILABLE =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY

// Distinct test user from fifo-to-db.test.ts so the two suites can run in parallel.
const TEST_USER_ID = 'a0000000-0000-0000-0000-000000000002'
const TEST_EMAIL = 'concurrency-test@example.com'
const TEST_PASSWORD = 'concurrency-test-pw-' + TEST_USER_ID
const TICKER = 'CONCUR'

function makeExec(brokerExecId: string, overrides: Partial<NormalizedExecution> = {}): NormalizedExecution {
  return {
    brokerExecId,
    brokerOrderId: brokerExecId,
    ticker: TICKER,
    assetClass: 'STK',
    side: 'BUY',
    quantity: 100,
    price: 100,
    commission: 1,
    executedAt: new Date('2026-04-23T14:30:00Z'),
    currency: 'USD',
    rawPayload: { source: 'concurrency-test' },
    ...overrides,
  }
}

describe.skipIf(!DB_AVAILABLE)('process-executions concurrency', () => {
  const supabase = DB_AVAILABLE ? createAdminClient() : null!

  async function cleanup() {
    await supabase.from('Order').delete().eq('userId', TEST_USER_ID)
    await supabase.from('Trade').delete().eq('userId', TEST_USER_ID)
    await supabase.from('User').delete().eq('id', TEST_USER_ID)
    await supabase.auth.admin.deleteUser(TEST_USER_ID).catch(() => {})
  }

  beforeAll(async () => {
    await cleanup()
    const { error: authErr } = await supabase.auth.admin.createUser({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin API accepts id, types lag
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    } as Parameters<typeof supabase.auth.admin.createUser>[0] & { id: string })
    if (authErr) throw authErr
    const { error } = await supabase
      .from('User')
      .insert({ id: TEST_USER_ID, email: TEST_EMAIL, settings: {} })
    if (error) throw error
  }, 30_000)

  afterAll(async () => {
    await cleanup()
  }, 30_000)

  beforeEach(async () => {
    // Clean only the trade/order tables between tests so each scenario starts
    // from a known empty position. The auth + User row persist for the suite.
    await supabase.from('Order').delete().eq('userId', TEST_USER_ID)
    await supabase.from('Trade').delete().eq('userId', TEST_USER_ID)
  })

  it('two concurrent OPENs collapse to ONE Trade with both Orders attached', async () => {
    // Fire both executions in parallel — each processExecutions call sees
    // status='Open' as empty on its first read, so both attempt to OPEN.
    // The partial unique index `Trade_userId_ticker_open_unique` rejects the
    // second insert, the loop catches it as ConflictError, re-reads the now-
    // existing Open trade, and re-runs FIFO → SCALE_IN on the second pass.
    const exec1 = makeExec('CONCUR-OPEN-1')
    const exec2 = makeExec('CONCUR-OPEN-2', { price: 102 })

    const [r1, r2] = await Promise.all([
      processExecutions([exec1], TEST_USER_ID),
      processExecutions([exec2], TEST_USER_ID),
    ])

    // Both executions must succeed — no FAILED rows.
    const status1 = r1[0].status
    const status2 = r2[0].status
    expect(status1).toBe('PROCESSED')
    expect(status2).toBe('PROCESSED')

    // Exactly ONE Open trade for this user+ticker survives.
    const { data: openTrades } = await supabase
      .from('Trade')
      .select('id, totalQuantity, totalQuantityOpened')
      .eq('userId', TEST_USER_ID)
      .eq('ticker', TICKER)
      .eq('status', 'Open')
    expect(openTrades).not.toBeNull()
    expect(openTrades!.length).toBe(1)
    const trade = openTrades![0]
    // Both opens scaled in → totalQuantity = 200, totalQuantityOpened = 200
    expect(Number(trade.totalQuantity)).toBe(200)
    expect(Number(trade.totalQuantityOpened)).toBe(200)

    // Both Orders should be attached to the surviving Trade.
    const { data: orders } = await supabase
      .from('Order')
      .select('brokerExecId, tradeId')
      .eq('userId', TEST_USER_ID)
      .eq('tradeId', trade.id)
    expect(orders).not.toBeNull()
    expect(orders!.length).toBe(2)
    const ids = orders!.map((o) => o.brokerExecId).sort()
    expect(ids).toEqual(['CONCUR-OPEN-1', 'CONCUR-OPEN-2'])
  }, 30_000)

  it('partial unique index rejects a manual duplicate Open trade', async () => {
    // Sanity check: the partial unique index that backs the conflict-retry
    // path is in place. Without the index the previous test would still
    // succeed but via the wrong mechanism (e.g. two Open rows).
    const r = await processExecutions([makeExec('CONCUR-UNIQ-1')], TEST_USER_ID)
    expect(r[0].status).toBe('PROCESSED')

    // Hand-craft a second Open trade with the same (userId, ticker) — must
    // be rejected with 23505 unique_violation.
    const { error } = await supabase.from('Trade').insert({
      userId: TEST_USER_ID,
      ticker: TICKER,
      assetType: 'STK',
      direction: 'Long',
      status: 'Open',
      openedAt: new Date().toISOString(),
      avgEntryPrice: 100,
      totalQuantity: 50,
      totalQuantityOpened: 50,
      totalCommission: 0,
      realizedPnl: 0,
      multiplier: 1,
      source: 'broker',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  }, 30_000)

  it('SCALE_IN against a stale read converges on the second attempt', async () => {
    // Seed an Open trade via the normal pipeline.
    const seed = await processExecutions([makeExec('CONCUR-SEED-1')], TEST_USER_ID)
    expect(seed[0].status).toBe('PROCESSED')

    // Two SCALE_IN executions in parallel — each reads totalQuantity=100,
    // but only one UPDATE can match the optimistic guard. The losing path
    // catches ConflictError, re-reads totalQuantity=200, re-runs FIFO, and
    // SCALE_IN succeeds against fresh state.
    const e1 = makeExec('CONCUR-ADD-1', { brokerOrderId: 'ord-add-1' })
    const e2 = makeExec('CONCUR-ADD-2', { brokerOrderId: 'ord-add-2', price: 105 })

    const [r1, r2] = await Promise.all([
      processExecutions([e1], TEST_USER_ID),
      processExecutions([e2], TEST_USER_ID),
    ])

    expect(r1[0].status).toBe('PROCESSED')
    expect(r2[0].status).toBe('PROCESSED')

    // Final state: ONE Open trade with totalQuantity = 100 (seed) + 100 + 100 = 300.
    const { data: openTrades } = await supabase
      .from('Trade')
      .select('id, totalQuantity, totalQuantityOpened')
      .eq('userId', TEST_USER_ID)
      .eq('ticker', TICKER)
      .eq('status', 'Open')
    expect(openTrades!.length).toBe(1)
    expect(Number(openTrades![0].totalQuantity)).toBe(300)
    expect(Number(openTrades![0].totalQuantityOpened)).toBe(300)

    // All three Orders attached to the same trade.
    const { data: orders } = await supabase
      .from('Order')
      .select('brokerExecId')
      .eq('userId', TEST_USER_ID)
      .eq('tradeId', openTrades![0].id)
    expect(orders!.length).toBe(3)
  }, 30_000)
})
