/**
 * Seed script — creates synthetic trades covering all FIFO scenarios.
 * Run: npx tsx --env-file=.env.local scripts/seed.ts
 *
 * Uses the Supabase service-role key to bypass RLS.
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * optional: SEED_USER_ID, SEED_USER_EMAIL.
 */

import { createAdminClient } from '../lib/supabase/admin'
import type { TablesInsert } from '../lib/db/types'

const USER_ID = process.env.SEED_USER_ID ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const USER_EMAIL = process.env.SEED_USER_EMAIL ?? 'me@example.com'

let execCounter = 0
function nextExecId() {
  execCounter++
  return `SEED-EXEC-${String(execCounter).padStart(3, '0')}`
}
let orderCounter = 0
function nextOrderId() {
  orderCounter++
  return `SEED-ORDER-${String(orderCounter).padStart(3, '0')}`
}

const base = new Date('2026-01-01T10:00:00Z')
function daysAgo(n: number) {
  return new Date(base.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
}

type TradeInsert = TablesInsert<'Trade'>
type OrderInsert = TablesInsert<'Order'>

const supabase = createAdminClient()

async function insertTradeWithOrders(
  trade: Omit<TradeInsert, 'id'>,
  orders: Array<Omit<OrderInsert, 'tradeId' | 'id'>>
) {
  const { data: tradeRow, error: tErr } = await supabase
    .from('Trade')
    .insert(trade)
    .select('id')
    .single()
  if (tErr || !tradeRow) throw new Error(`Trade insert failed: ${tErr?.message}`)

  const orderRows = orders.map(o => ({ ...o, tradeId: tradeRow.id }))
  const { error: oErr } = await supabase.from('Order').insert(orderRows)
  if (oErr) throw new Error(`Order insert failed: ${oErr.message}`)

  return tradeRow.id
}

async function main() {
  console.log('🌱 Seeding database...')

  // Upsert user
  const { error: userErr } = await supabase
    .from('User')
    .upsert({ id: USER_ID, email: USER_EMAIL, settings: {} }, { onConflict: 'id' })
  if (userErr) throw new Error(`User upsert failed: ${userErr.message}`)

  // ─── CLOSED LONG WINS ──────────────────────────────────────────────────
  const longWins = [
    { ticker: 'AAPL', entry: 150, stop: 145, exit: 155, qty: 100, setup: 'breakout', daysOpen: 90 },
    { ticker: 'MSFT', entry: 300, stop: 290, exit: 320, qty: 50, setup: 'pullback_ema', daysOpen: 85 },
    { ticker: 'NVDA', entry: 800, stop: 780, exit: 860, qty: 20, setup: 'vcp', daysOpen: 80 },
    { ticker: 'TSLA', entry: 200, stop: 192, exit: 240, qty: 50, setup: 'breakout', daysOpen: 75 },
    { ticker: 'META', entry: 480, stop: 476, exit: 482, qty: 100, setup: 'range', daysOpen: 70 },
  ]
  for (const t of longWins) {
    const openedAt = daysAgo(t.daysOpen)
    const closedAt = daysAgo(t.daysOpen - 5)
    const commission = 1.5
    const pnl = (t.exit - t.entry) * t.qty - commission * 2
    const riskPerShare = t.entry - t.stop
    const actualR = pnl / (riskPerShare * t.qty)
    await insertTradeWithOrders(
      {
        userId: USER_ID, ticker: t.ticker, direction: 'Long', status: 'Closed',
        setupType: t.setup, openedAt, closedAt,
        avgEntryPrice: t.entry, avgExitPrice: t.exit,
        totalQuantity: 0, totalQuantityOpened: t.qty,
        stopPrice: t.stop, actualR, realizedPnl: pnl,
        totalCommission: commission * 2, result: 'Win',
      },
      [
        { userId: USER_ID, side: 'BUY', quantity: t.qty, price: t.entry, commission, executedAt: openedAt, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
        { userId: USER_ID, side: 'SELL', quantity: t.qty, price: t.exit, commission, executedAt: closedAt, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
      ]
    )
  }

  // ─── CLOSED LONG LOSSES ────────────────────────────────────────────────
  const longLosses = [
    { ticker: 'AMD', entry: 120, stop: 115, exit: 117.5, qty: 100, setup: 'breakout', daysOpen: 65 },
    { ticker: 'GOOG', entry: 170, stop: 165, exit: 165, qty: 50, setup: 'pullback_ema', daysOpen: 60 },
    { ticker: 'AMZN', entry: 190, stop: 185, exit: 180, qty: 40, setup: 'vcp', daysOpen: 55 },
    { ticker: 'NFLX', entry: 600, stop: 596, exit: 596, qty: 30, setup: 'range', daysOpen: 50 },
    { ticker: 'UBER', entry: 75, stop: 72, exit: 72, qty: 100, setup: 'breakout', daysOpen: 45 },
  ]
  for (const t of longLosses) {
    const openedAt = daysAgo(t.daysOpen)
    const closedAt = daysAgo(t.daysOpen - 3)
    const commission = 1.5
    const pnl = (t.exit - t.entry) * t.qty - commission * 2
    const riskPerShare = t.entry - t.stop
    const actualR = pnl / (riskPerShare * t.qty)
    await insertTradeWithOrders(
      {
        userId: USER_ID, ticker: t.ticker, direction: 'Long', status: 'Closed',
        setupType: t.setup, openedAt, closedAt,
        avgEntryPrice: t.entry, avgExitPrice: t.exit,
        totalQuantity: 0, totalQuantityOpened: t.qty,
        stopPrice: t.stop, actualR, realizedPnl: pnl,
        totalCommission: commission * 2,
        result: actualR >= -0.1 ? 'Breakeven' : 'Loss',
      },
      [
        { userId: USER_ID, side: 'BUY', quantity: t.qty, price: t.entry, commission, executedAt: openedAt, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
        { userId: USER_ID, side: 'SELL', quantity: t.qty, price: t.exit, commission, executedAt: closedAt, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
      ]
    )
  }

  // ─── CLOSED SHORT WINS ─────────────────────────────────────────────────
  const shortWins = [
    { ticker: 'SPY', entry: 510, stop: 515, exit: 500, qty: 20, setup: 'range', daysOpen: 40 },
    { ticker: 'QQQ', entry: 430, stop: 435, exit: 420, qty: 25, setup: 'breakout', daysOpen: 35 },
    { ticker: 'RIVN', entry: 12, stop: 13, exit: 10, qty: 200, setup: 'pullback_ema', daysOpen: 30 },
  ]
  for (const t of shortWins) {
    const openedAt = daysAgo(t.daysOpen)
    const closedAt = daysAgo(t.daysOpen - 4)
    const commission = 1.5
    const pnl = (t.entry - t.exit) * t.qty - commission * 2
    const riskPerShare = t.stop - t.entry
    const actualR = pnl / (riskPerShare * t.qty)
    await insertTradeWithOrders(
      {
        userId: USER_ID, ticker: t.ticker, direction: 'Short', status: 'Closed',
        setupType: t.setup, openedAt, closedAt,
        avgEntryPrice: t.entry, avgExitPrice: t.exit,
        totalQuantity: 0, totalQuantityOpened: t.qty,
        stopPrice: t.stop, actualR, realizedPnl: pnl,
        totalCommission: commission * 2, result: 'Win',
      },
      [
        { userId: USER_ID, side: 'SELL', quantity: t.qty, price: t.entry, commission, executedAt: openedAt, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
        { userId: USER_ID, side: 'BUY', quantity: t.qty, price: t.exit, commission, executedAt: closedAt, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
      ]
    )
  }

  // ─── CLOSED SHORT LOSSES ───────────────────────────────────────────────
  const shortLosses = [
    { ticker: 'XOM', entry: 100, stop: 103, exit: 103, qty: 50, setup: 'range', daysOpen: 25 },
    { ticker: 'CVX', entry: 150, stop: 154, exit: 156, qty: 30, setup: 'breakout', daysOpen: 20 },
  ]
  for (const t of shortLosses) {
    const openedAt = daysAgo(t.daysOpen)
    const closedAt = daysAgo(t.daysOpen - 2)
    const commission = 1.5
    const pnl = (t.entry - t.exit) * t.qty - commission * 2
    const riskPerShare = t.stop - t.entry
    const actualR = pnl / (riskPerShare * t.qty)
    await insertTradeWithOrders(
      {
        userId: USER_ID, ticker: t.ticker, direction: 'Short', status: 'Closed',
        setupType: t.setup, openedAt, closedAt,
        avgEntryPrice: t.entry, avgExitPrice: t.exit,
        totalQuantity: 0, totalQuantityOpened: t.qty,
        stopPrice: t.stop, actualR, realizedPnl: pnl,
        totalCommission: commission * 2, result: 'Loss',
      },
      [
        { userId: USER_ID, side: 'SELL', quantity: t.qty, price: t.entry, commission, executedAt: openedAt, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
        { userId: USER_ID, side: 'BUY', quantity: t.qty, price: t.exit, commission, executedAt: closedAt, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
      ]
    )
  }

  // ─── OPEN LONG ─────────────────────────────────────────────────────────
  await insertTradeWithOrders(
    {
      userId: USER_ID, ticker: 'COST', direction: 'Long', status: 'Open',
      setupType: 'vcp', openedAt: daysAgo(5),
      avgEntryPrice: 920, totalQuantity: 10, totalQuantityOpened: 10,
      stopPrice: 910, totalCommission: 1.5, realizedPnl: 0,
    },
    [{ userId: USER_ID, side: 'BUY', quantity: 10, price: 920, commission: 1.5, executedAt: daysAgo(5), brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} }]
  )

  // ─── OPEN LONG (scale-in) ──────────────────────────────────────────────
  const scaleInAvg = (200 * 100 + 205 * 50) / 150
  await insertTradeWithOrders(
    {
      userId: USER_ID, ticker: 'PLTR', direction: 'Long', status: 'Open',
      setupType: 'breakout', openedAt: daysAgo(8),
      avgEntryPrice: scaleInAvg, totalQuantity: 150, totalQuantityOpened: 150,
      stopPrice: 195, totalCommission: 3, realizedPnl: 0,
    },
    [
      { userId: USER_ID, side: 'BUY', quantity: 100, price: 200, commission: 1.5, executedAt: daysAgo(8), brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
      { userId: USER_ID, side: 'BUY', quantity: 50, price: 205, commission: 1.5, executedAt: daysAgo(7), brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
    ]
  )

  // ─── OPEN LONG (near stop) ─────────────────────────────────────────────
  await insertTradeWithOrders(
    {
      userId: USER_ID, ticker: 'SNAP', direction: 'Long', status: 'Open',
      setupType: 'range', openedAt: daysAgo(3),
      avgEntryPrice: 11, totalQuantity: 500, totalQuantityOpened: 500,
      stopPrice: 10.5, totalCommission: 1.5, realizedPnl: 0,
    },
    [{ userId: USER_ID, side: 'BUY', quantity: 500, price: 11, commission: 1.5, executedAt: daysAgo(3), brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} }]
  )

  // ─── OPEN SHORT ────────────────────────────────────────────────────────
  await insertTradeWithOrders(
    {
      userId: USER_ID, ticker: 'LYFT', direction: 'Short', status: 'Open',
      setupType: 'pullback_ema', openedAt: daysAgo(2),
      avgEntryPrice: 15, totalQuantity: 200, totalQuantityOpened: 200,
      stopPrice: 16, totalCommission: 1.5, realizedPnl: 0,
    },
    [{ userId: USER_ID, side: 'SELL', quantity: 200, price: 15, commission: 1.5, executedAt: daysAgo(2), brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} }]
  )
  await insertTradeWithOrders(
    {
      userId: USER_ID, ticker: 'PINS', direction: 'Short', status: 'Open',
      setupType: 'range', openedAt: daysAgo(1),
      avgEntryPrice: 28, totalQuantity: 150, totalQuantityOpened: 150,
      stopPrice: 29.5, totalCommission: 1.5, realizedPnl: 0,
    },
    [{ userId: USER_ID, side: 'SELL', quantity: 150, price: 28, commission: 1.5, executedAt: daysAgo(1), brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} }]
  )

  // ─── PARTIAL FILLS (closed) ────────────────────────────────────────────
  const pf1OrderId = nextOrderId()
  const pf1Avg = (50 * 100 + 50 * 101 + 50 * 102) / 150
  await insertTradeWithOrders(
    {
      userId: USER_ID, ticker: 'HOOD', direction: 'Long', status: 'Closed',
      setupType: 'breakout', openedAt: daysAgo(15), closedAt: daysAgo(12),
      avgEntryPrice: pf1Avg, avgExitPrice: 108,
      totalQuantity: 0, totalQuantityOpened: 150,
      stopPrice: 98, totalCommission: 6,
      realizedPnl: (108 - pf1Avg) * 150 - 6,
      actualR: ((108 - pf1Avg) * 150 - 6) / ((pf1Avg - 98) * 150),
      result: 'Win',
    },
    [
      { userId: USER_ID, side: 'BUY', quantity: 50, price: 100, commission: 1.5, executedAt: daysAgo(15), brokerExecId: nextExecId(), brokerOrderId: pf1OrderId, rawPayload: {} },
      { userId: USER_ID, side: 'BUY', quantity: 50, price: 101, commission: 1.5, executedAt: new Date(new Date(daysAgo(15)).getTime() + 30_000).toISOString(), brokerExecId: nextExecId(), brokerOrderId: pf1OrderId, rawPayload: {} },
      { userId: USER_ID, side: 'BUY', quantity: 50, price: 102, commission: 1.5, executedAt: new Date(new Date(daysAgo(15)).getTime() + 60_000).toISOString(), brokerExecId: nextExecId(), brokerOrderId: pf1OrderId, rawPayload: {} },
      { userId: USER_ID, side: 'SELL', quantity: 150, price: 108, commission: 1.5, executedAt: daysAgo(12), brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
    ]
  )

  // ─── PARTIAL FILLS (open) ──────────────────────────────────────────────
  const pf2OrderId = nextOrderId()
  const pf2Avg = (40 * 500 + 40 * 502 + 20 * 498) / 100
  await insertTradeWithOrders(
    {
      userId: USER_ID, ticker: 'BRK', direction: 'Long', status: 'Open',
      setupType: 'vcp', openedAt: daysAgo(4),
      avgEntryPrice: pf2Avg, totalQuantity: 100, totalQuantityOpened: 100,
      stopPrice: 490, totalCommission: 4.5, realizedPnl: 0,
    },
    [
      { userId: USER_ID, side: 'BUY', quantity: 40, price: 500, commission: 1.5, executedAt: daysAgo(4), brokerExecId: nextExecId(), brokerOrderId: pf2OrderId, rawPayload: {} },
      { userId: USER_ID, side: 'BUY', quantity: 40, price: 502, commission: 1.5, executedAt: new Date(new Date(daysAgo(4)).getTime() + 20_000).toISOString(), brokerExecId: nextExecId(), brokerOrderId: pf2OrderId, rawPayload: {} },
      { userId: USER_ID, side: 'BUY', quantity: 20, price: 498, commission: 1.5, executedAt: new Date(new Date(daysAgo(4)).getTime() + 40_000).toISOString(), brokerExecId: nextExecId(), brokerOrderId: pf2OrderId, rawPayload: {} },
    ]
  )

  // ─── REVERSAL PAIR ─────────────────────────────────────────────────────
  const reversalOpen = daysAgo(18)
  const reversalClose = daysAgo(16)
  const reversalEntry = 230
  const reversalExit = 215
  const reversalLongPnl = (reversalExit - reversalEntry) * 100 - 3
  await insertTradeWithOrders(
    {
      userId: USER_ID, ticker: 'COIN', direction: 'Long', status: 'Closed',
      setupType: 'breakout', openedAt: reversalOpen, closedAt: reversalClose,
      avgEntryPrice: reversalEntry, avgExitPrice: reversalExit,
      totalQuantity: 0, totalQuantityOpened: 100,
      stopPrice: 220, totalCommission: 3, realizedPnl: reversalLongPnl,
      actualR: reversalLongPnl / ((reversalEntry - 220) * 100),
      result: 'Loss',
    },
    [
      { userId: USER_ID, side: 'BUY', quantity: 100, price: reversalEntry, commission: 1.5, executedAt: reversalOpen, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
      { userId: USER_ID, side: 'SELL', quantity: 100, price: reversalExit, commission: 1.5, executedAt: reversalClose, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} },
    ]
  )
  await insertTradeWithOrders(
    {
      userId: USER_ID, ticker: 'COIN', direction: 'Short', status: 'Open',
      setupType: 'breakout', openedAt: reversalClose,
      avgEntryPrice: reversalExit, totalQuantity: 100, totalQuantityOpened: 100,
      stopPrice: 222, totalCommission: 1.5, realizedPnl: 0,
    },
    [{ userId: USER_ID, side: 'SELL', quantity: 100, price: reversalExit, commission: 1.5, executedAt: reversalClose, brokerExecId: nextExecId(), brokerOrderId: nextOrderId(), rawPayload: {} }]
  )

  const { count: tradeCount } = await supabase
    .from('Trade').select('id', { count: 'exact', head: true }).eq('userId', USER_ID)
  const { count: orderCount } = await supabase
    .from('Order').select('id', { count: 'exact', head: true }).eq('userId', USER_ID)
  console.log(`✅ Seeded ${tradeCount} trades and ${orderCount} orders for user ${USER_EMAIL}`)
}

main().catch(e => { console.error(e); process.exit(1) })
