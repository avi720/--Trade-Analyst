/**
 * Seed script — brings the QA user up to 136 closed trades spanning the past year,
 * with every ManualLeg / Trade-annotation field populated. Purpose: realistic dataset
 * for the landing-page product-video demo.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-qa-video-data.ts
 *
 * Idempotent-ish: brokerExecId prefix "QASEED-" — re-runs will hit UNIQUE and fail
 * loudly. To reset, delete rows with brokerExecId LIKE 'QASEED-%' first.
 */

import { createAdminClient } from '../lib/supabase/admin'
import type { TablesInsert } from '../lib/db/types'

/* ─────────── Config ─────────── */

const USER_ID = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90' // QA user (yadefam806@ameady.com)
const TARGET_TOTAL = 136
const RNG_SEED = 20260704 // deterministic

// Span: last 365 days ending "now"
const NOW = new Date('2026-07-04T15:30:00Z').getTime()
const DAY = 24 * 60 * 60 * 1000
const SPAN_MS = 365 * DAY

// Latest allowed close moment: the most recent Friday ≤ NOW at 20:00 UTC
// (~22:00 Israel local). Prevents Sat/Sun closes from landing in the data
// when the seed runs on a weekend.
const LATEST_CLOSE_MS = (() => {
  const d = new Date(NOW)
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1) // walk back to Fri
  d.setUTCHours(20, 0, 0, 0)
  return d.getTime()
})()

/* ─────────── Deterministic RNG ─────────── */

function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(RNG_SEED)
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}
function pickWeighted<T>(arr: readonly (readonly [T, number])[]): T {
  const total = arr.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [v, w] of arr) {
    r -= w
    if (r <= 0) return v
  }
  return arr[arr.length - 1][0]
}
function between(lo: number, hi: number) {
  return lo + rand() * (hi - lo)
}
function round2(n: number) {
  return Math.round(n * 100) / 100
}

/* ─────────── Weekday helper ─────────── */

// Mutate `d` so it falls on Mon–Fri. Uses the RNG's stream to pick direction
// (back or forward) with equal probability, so Sat/Sun don't all pile onto
// the next Monday.
function shiftOffWeekend(d: Date) {
  const dow = d.getUTCDay()
  if (dow === 0) {
    // Sunday → Sat forward to Mon (+1) or back to Fri (−2)
    d.setUTCDate(d.getUTCDate() + (rand() < 0.5 ? 1 : -2))
  } else if (dow === 6) {
    // Saturday → forward to Mon (+2) or back to Fri (−1)
    d.setUTCDate(d.getUTCDate() + (rand() < 0.5 ? 2 : -1))
  }
}

/* ─────────── Timezone helper ─────────── */

// Return UTC ms whose Israel-local time is `israelHour` on the given UTC day.
// Uses Intl to resolve the actual UTC offset for that specific date so DST
// transitions (Israel switches on the Friday before the last Sunday of March
// and on the last Sunday of October) don't produce off-by-one hours.
function israelLocalHourToUtcMs(dayUtc: Date, israelHour: number): number {
  // Sample midday to read the offset in a stable, non-DST-edge moment
  const probe = new Date(dayUtc.getTime() + 12 * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(probe)
  const iH = parseInt(parts.find(p => p.type === 'hour')!.value, 10)
  const iM = parseInt(parts.find(p => p.type === 'minute')!.value, 10)
  const israelHourAtProbe = iH + iM / 60
  const offsetHours = israelHourAtProbe - 12 // 2 in winter, 3 in summer
  return dayUtc.getTime() + (israelHour - offsetHours) * 60 * 60 * 1000
}

/* ─────────── Universes ─────────── */

type TickerSpec = { ticker: string; low: number; high: number }
const TICKERS: TickerSpec[] = [
  { ticker: 'NVDA', low: 105, high: 145 },
  { ticker: 'AAPL', low: 180, high: 225 },
  { ticker: 'MSFT', low: 380, high: 455 },
  { ticker: 'TSLA', low: 210, high: 305 },
  { ticker: 'AMZN', low: 165, high: 225 },
  { ticker: 'GOOGL', low: 148, high: 195 },
  { ticker: 'META', low: 500, high: 620 },
  { ticker: 'AMD', low: 125, high: 185 },
  { ticker: 'NFLX', low: 545, high: 720 },
  { ticker: 'SPY', low: 515, high: 605 },
  { ticker: 'QQQ', low: 440, high: 520 },
  { ticker: 'HOOD', low: 22, high: 38 },
  { ticker: 'COIN', low: 195, high: 325 },
  { ticker: 'PLTR', low: 28, high: 58 },
  { ticker: 'ORCL', low: 128, high: 195 },
  { ticker: 'ADBE', low: 495, high: 625 },
  { ticker: 'CRM', low: 255, high: 335 },
  { ticker: 'INTC', low: 28, high: 52 },
  { ticker: 'MU', low: 88, high: 145 },
  { ticker: 'CRWD', low: 295, high: 405 },
]

const SETUPS = [
  'קרבה לממוצע - 200 ימים',
  'קרבה לממוצע - 150 ימים',
  'קרבה לממוצע - 100 ימים',
  'פריצת תבנית - קאפ והנדל',
  'פריצת תבנית - דגל שורי',
  'פריצת תבנית - אינברס ראש וכתפיים',
  'פריצת תבנית - תחתית כפולה',
  'פריצת תבנית - תחתית משולשת',
  'פריצת תבנית - משולש יורד',
  'פריצת תבנית - משולש עולה',
  'פריצת תבנית - התכנסות מלבנית',
  'פריצת תבנית - יתד יורד',
  'אחר - סקאלפ',
] as const

const EMOTIONS = [
  'רגוע', 'מתוח', 'בטוח', 'FOMO', 'ביטחון יתר',
  'פחד', 'נקמה', 'היסוס', 'שיעמום', 'טילטול',
] as const

const BROKERS = ['IBKR', 'COLMEX', 'BLINK', 'IBI', 'MEYTAV_TRADE', 'EXELLENCE_TRADE'] as const
const ORDER_TYPES = ['LMT', 'MKT', 'STP', 'STP_LMT'] as const
const ACCOUNTS = ['U1234567', 'U7654321', 'DEMO-1'] as const

const NOTES_POOL = [
  'נכנסתי לפי התכנית, גודל פוזיציה תקין.',
  'הזוויית הכניסה הייתה קרובה מדי לסטופ.',
  'שוק ניתר חזק, יצאתי מוקדם מדי.',
  'פרייס אקשן נראה נקי, שמרתי על הסטופ.',
  'נמנעתי מ-FOMO, חיכיתי לפולבק.',
  'ניהול הכסף היה טוב, יצאתי בשליש רווח.',
  'המחיר לא סגר מעל הרמה — הבנתי מהר ויצאתי.',
  'ההתפרצות הייתה על נפח גבוה מאוד, אישור טוב.',
  'שוק הפוך מהתחזית — קיבלתי סטופ מהיר.',
  'תזמון מצוין, קרוב לתחתית הטווח.',
  'נכנסתי מוקדם מדי לפני הפריצה עצמה.',
  'החזקתי מעבר לטארגט, שווה היה לצאת קודם.',
] as const

const DID_RIGHT_POOL = [
  'שמרתי על גודל פוזיציה נכון.',
  'לא הזזתי את הסטופ לרעתי.',
  'חיכיתי לאישור על הבר לפני כניסה.',
  'תיעדתי בזמן אמת.',
  'יצאתי לפי התוכנית ולא לפי הרגש.',
  'לקחתי הפסק אחרי הפסד שני — לא רדפתי.',
  'הגדרתי יעד מראש והתחייבתי אליו.',
] as const

const WOULD_CHANGE_POOL = [
  'לחכות עוד 15 דקות לפני כניסה.',
  'סטופ קצת רחוק יותר, פחות רועש.',
  'לצאת בחצי בטארגט 1 ולא בכולה.',
  'לא לפתוח פוזיציה שנייה באותו יום.',
  'לוותר על כניסות בסטופ צר מדי.',
  'לעבוד יותר עם ההגנה על הרווח (trailing).',
  'לבדוק סנטימנט שוק לפני כניסה.',
] as const

/* ─────────── Trade template ─────────── */

type TradeTemplate = {
  ticker: string
  direction: 'Long' | 'Short'
  entry: number
  stop: number
  qty: number
  outcome: 'Win' | 'Loss' | 'Breakeven'
  targetR: number
  actualR: number
  exit: number
  openedAt: string
  closedAt: string
  setup: string
  emotion: string
  closeReason: 'original_stop' | 'target' | 'modified_stop' | 'other'
  broker: string
  orderType: string
  account: string
  notes: string
  didRight: string
  wouldChange: string
  commissionPerLeg: number
}

// Tickers we intentionally push into net-loss for the "P&L לפי נייר" chart —
// the demo dataset should show a couple of red bars, not an all-green wall.
const LOSER_TICKERS = new Set(['INTC', 'HOOD', 'COIN'])
// Setups intentionally pushed into net-loss for the "ביצועי סטאפ" chart, so
// the Avg R bars show downward/red bars alongside the winners.
const LOSER_SETUPS = new Set<string>([
  'אחר - סקאלפ',
  'פריצת תבנית - דגל שורי',
])

function buildTemplate(i: number, total: number): TradeTemplate {
  const spec = pick(TICKERS)
  const direction: 'Long' | 'Short' = pickWeighted([['Long', 70], ['Short', 30]])
  const setup = pick(SETUPS)
  const isLoserTicker = LOSER_TICKERS.has(spec.ticker)
  const isLoserSetup = LOSER_SETUPS.has(setup)
  const outcome: 'Win' | 'Loss' | 'Breakeven' = (isLoserTicker || isLoserSetup)
    ? pickWeighted([['Loss', 78], ['Win', 18], ['Breakeven', 4]])
    : pickWeighted([['Win', 62], ['Loss', 33], ['Breakeven', 5]])

  const entry = round2(between(spec.low, spec.high))
  // Stop distance: 1-4% of entry
  const stopPct = between(0.01, 0.04)
  const stop = direction === 'Long'
    ? round2(entry * (1 - stopPct))
    : round2(entry * (1 + stopPct))
  const riskPerShare = Math.abs(entry - stop)

  // Position size: risk $50-$400
  const riskDollars = between(50, 400)
  const qty = Math.max(5, Math.round(riskDollars / riskPerShare))

  // Target R by intent (2-3.5)
  const targetR = round2(between(2, 3.5))

  // Realised R depends on outcome
  let actualR: number
  if (outcome === 'Win') actualR = round2(between(0.8, 3.2))
  else if (outcome === 'Loss') actualR = round2(-between(0.6, 1.05))
  else actualR = round2(between(-0.15, 0.15))

  const exit = direction === 'Long'
    ? round2(entry + actualR * riskPerShare)
    : round2(entry - actualR * riskPerShare)

  // Pin OPEN and CLOSE to Israeli US-market hours (16:30–23:00 Asia/Jerusalem)
  // regardless of DST. The "לפי שעה" chart groups by closedAt.getHours() in the
  // browser's local TZ (see lib/utils/research-charts.ts:88), so we must convert
  // Israel-local hours → UTC using the correct offset for each specific day
  // (Israel is UTC+2 winter, UTC+3 summer — DST edges matter).
  const slot = SPAN_MS * ((i + rand() * 0.6) / total)
  const rawOpenMs = NOW - SPAN_MS + slot
  const openDayUtc = new Date(rawOpenMs)
  openDayUtc.setUTCHours(0, 0, 0, 0)
  // Skip US-market-closed days. NY session Mon–Fri 09:30–16:00 maps to Israel
  // Mon–Fri 16:30–23:00 (both zones share the same weekday in that window
  // because Israel is always UTC+2/+3 during those hours), so we can filter
  // on getUTCDay() of the anchor day. Shift Sat→±1 and Sun→±1 with 50/50 bias
  // so we don't pile up on Monday.
  shiftOffWeekend(openDayUtc)
  const openIsraelHour = 16.5 + rand() * 6.4 // [16:30, 22:54) local
  const openedAtMs = israelLocalHourToUtcMs(openDayUtc, openIsraelHour)

  // Hold: 30% intraday, 70% multi-day (up to 50)
  const intraday = rand() < 0.3
  let closedAtMs: number
  if (intraday) {
    const roomLeft = 23 - openIsraelHour
    const holdHours = Math.min(between(0.5, 6.5), Math.max(0.25, roomLeft - 0.1))
    closedAtMs = openedAtMs + holdHours * 60 * 60 * 1000
  } else {
    // Cap holdDays to what's actually available between open and LATEST_CLOSE_MS
    const daysAvailable = Math.max(1, Math.floor((LATEST_CLOSE_MS - openedAtMs) / DAY))
    const holdDays = Math.max(1, Math.round(between(1, Math.min(50, daysAvailable))))
    const closeDayUtc = new Date(openedAtMs)
    closeDayUtc.setUTCDate(closeDayUtc.getUTCDate() + holdDays)
    closeDayUtc.setUTCHours(0, 0, 0, 0)
    // Skip weekends on the close side too — Sat/Sun US markets are closed
    shiftOffWeekend(closeDayUtc)
    const closeIsraelHour = 16.5 + rand() * 6.4
    closedAtMs = israelLocalHourToUtcMs(closeDayUtc, closeIsraelHour)
  }
  closedAtMs = Math.min(closedAtMs, LATEST_CLOSE_MS)
  const openedAt = new Date(openedAtMs).toISOString()
  const closedAt = new Date(closedAtMs).toISOString()

  // Close reason from outcome
  let closeReason: TradeTemplate['closeReason']
  if (outcome === 'Loss') closeReason = pickWeighted([['original_stop', 80], ['modified_stop', 15], ['other', 5]])
  else if (outcome === 'Win' && actualR >= targetR * 0.9) closeReason = pickWeighted([['target', 75], ['other', 25]])
  else closeReason = pickWeighted([['other', 60], ['modified_stop', 25], ['target', 15]])

  return {
    ticker: spec.ticker,
    direction,
    entry,
    stop,
    qty,
    outcome,
    targetR,
    actualR,
    exit,
    openedAt,
    closedAt,
    setup,
    emotion: pick(EMOTIONS),
    closeReason,
    broker: pick(BROKERS),
    orderType: pick(ORDER_TYPES),
    account: pick(ACCOUNTS),
    notes: pick(NOTES_POOL),
    didRight: pick(DID_RIGHT_POOL),
    wouldChange: pick(WOULD_CHANGE_POOL),
    commissionPerLeg: round2(between(0.5, 2.0)),
  }
}

/* ─────────── Persist ─────────── */

const supabase = createAdminClient()

type TradeInsert = TablesInsert<'Trade'>
type OrderInsert = TablesInsert<'Order'>

async function insertOne(t: TradeTemplate, seq: number) {
  const commissionOpen = t.commissionPerLeg
  const commissionClose = t.commissionPerLeg
  const totalCommission = round2(commissionOpen + commissionClose)
  const gross = t.direction === 'Long'
    ? (t.exit - t.entry) * t.qty
    : (t.entry - t.exit) * t.qty
  const realizedPnl = round2(gross - totalCommission)
  const targetPrice = t.direction === 'Long'
    ? round2(t.entry + t.targetR * Math.abs(t.entry - t.stop))
    : round2(t.entry - t.targetR * Math.abs(t.entry - t.stop))
  const actualRRecalc = realizedPnl / (Math.abs(t.entry - t.stop) * t.qty)

  const tradeInsert: Omit<TradeInsert, 'id'> = {
    userId: USER_ID,
    ticker: t.ticker,
    direction: t.direction,
    status: 'Closed',
    source: 'manual',
    setupType: t.setup,
    emotionalState: t.emotion,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    avgEntryPrice: t.entry,
    avgExitPrice: t.exit,
    totalQuantity: 0,
    totalQuantityOpened: t.qty,
    stopPrice: t.stop,
    targetPrice,
    actualR: round2(actualRRecalc),
    realizedPnl,
    totalCommission,
    result: t.outcome,
    closeReason: t.closeReason,
    notes: t.notes,
    didRight: t.didRight,
    wouldChange: t.wouldChange,
    assetType: 'STK',
    multiplier: 1,
  }

  const { data: tradeRow, error: tErr } = await supabase
    .from('Trade').insert(tradeInsert).select('id').single()
  if (tErr || !tradeRow) throw new Error(`Trade insert failed (#${seq}): ${tErr?.message}`)

  const openSide = t.direction === 'Long' ? 'BUY' : 'SELL'
  const closeSide = t.direction === 'Long' ? 'SELL' : 'BUY'
  const openNetCash = round2(
    t.direction === 'Long' ? -(t.entry * t.qty) - commissionOpen : (t.entry * t.qty) - commissionOpen
  )
  const closeNetCash = round2(
    t.direction === 'Long' ? (t.exit * t.qty) - commissionClose : -(t.exit * t.qty) - commissionClose
  )
  const orderIdOpen = `QASEED-ORD-${String(seq).padStart(4, '0')}-O`
  const orderIdClose = `QASEED-ORD-${String(seq).padStart(4, '0')}-C`
  const execBase = `QASEED-${t.ticker}-${new Date(t.openedAt).getTime()}`

  const orders: Omit<OrderInsert, 'id'>[] = [
    {
      tradeId: tradeRow.id,
      userId: USER_ID,
      side: openSide,
      quantity: t.qty,
      price: t.entry,
      commission: commissionOpen,
      commissionCurrency: 'USD',
      currency: 'USD',
      executedAt: t.openedAt,
      orderTime: new Date(new Date(t.openedAt).getTime() - 5 * 60 * 1000).toISOString(),
      orderType: t.orderType,
      brokerExecId: `${execBase}-1`,
      brokerOrderId: orderIdOpen,
      brokerClientAccountId: t.account,
      netCash: openNetCash,
      rawPayload: { broker: t.broker, seed: 'QA-VIDEO' },
    },
    {
      tradeId: tradeRow.id,
      userId: USER_ID,
      side: closeSide,
      quantity: t.qty,
      price: t.exit,
      commission: commissionClose,
      commissionCurrency: 'USD',
      currency: 'USD',
      executedAt: t.closedAt,
      orderTime: new Date(new Date(t.closedAt).getTime() - 3 * 60 * 1000).toISOString(),
      orderType: t.orderType,
      brokerExecId: `${execBase}-2`,
      brokerOrderId: orderIdClose,
      brokerClientAccountId: t.account,
      netCash: closeNetCash,
      rawPayload: { broker: t.broker, seed: 'QA-VIDEO' },
    },
  ]

  const { error: oErr } = await supabase.from('Order').insert(orders)
  if (oErr) throw new Error(`Order insert failed (#${seq}, trade ${tradeRow.id}): ${oErr.message}`)
}

/* ─────────── Main ─────────── */

async function main() {
  const { count: current, error: cErr } = await supabase
    .from('Trade').select('id', { count: 'exact', head: true }).eq('userId', USER_ID)
  if (cErr) throw cErr
  const have = current ?? 0
  const need = TARGET_TOTAL - have
  if (need <= 0) {
    console.log(`Already at ${have} trades — nothing to do.`)
    return
  }
  console.log(`Seeding ${need} new trades (currently ${have} → target ${TARGET_TOTAL}).`)

  let failures = 0
  for (let i = 0; i < need; i++) {
    const t = buildTemplate(i, need)
    try {
      await insertOne(t, i + 1)
      if ((i + 1) % 20 === 0) console.log(`  · inserted ${i + 1}/${need}`)
    } catch (e) {
      failures++
      console.error(`  ✗ #${i + 1} (${t.ticker}) failed:`, (e as Error).message)
    }
  }

  const { count: after } = await supabase
    .from('Trade').select('id', { count: 'exact', head: true }).eq('userId', USER_ID)
  console.log(`Done. Trades for QA user: ${after} (failures: ${failures}).`)
}

main().catch(e => { console.error(e); process.exit(1) })
