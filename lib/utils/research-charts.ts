import type { ClosedTrade } from '@/types/trade'

export interface TickerStat {
  ticker: string
  totalPnl: number
  tradeCount: number
  winRate: number
}

export interface HoldTimePoint {
  holdHours: number
  actualR: number
  ticker: string
  result: string
}

export interface DayStat {
  day: string
  totalPnl: number
  tradeCount: number
}

export interface HourStat {
  hour: number
  totalPnl: number
  tradeCount: number
}

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

// Group closed P&L by ticker, sorted descending by totalPnl
export function pnlByTicker(trades: ClosedTrade[]): TickerStat[] {
  const groups = new Map<string, ClosedTrade[]>()
  for (const t of trades) {
    if (t.realizedPnl == null) continue
    if (!groups.has(t.ticker)) groups.set(t.ticker, [])
    groups.get(t.ticker)!.push(t)
  }
  return Array.from(groups.entries())
    .map(([ticker, group]) => ({
      ticker,
      totalPnl: group.reduce((s, t) => s + t.realizedPnl, 0),
      tradeCount: group.length,
      winRate: group.filter(t => t.result === 'Win').length / group.length,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl)
}

// One point per trade: hold duration (hours) vs actualR for scatter chart
export function holdTimeVsR(trades: ClosedTrade[]): HoldTimePoint[] {
  const points: HoldTimePoint[] = []
  for (const t of trades) {
    if (t.actualR == null) continue
    const holdHours = (t.closedAt.getTime() - t.openedAt.getTime()) / 3_600_000
    points.push({
      holdHours: Math.max(0, holdHours),
      actualR: t.actualR,
      ticker: t.ticker,
      result: t.result ?? '',
    })
  }
  return points
}

// Realized P&L by day of week (Sunday=0 … Saturday=6), always returns all 7 days.
// Uses the BROWSER's local timezone (the user's session TZ) — matches what the
// trade-detail modal displays via fmtLocalDateTime. Trades stored in UTC are
// translated to the user's wall-clock day so the chart matches what they
// actually experienced sitting at the desk.
export function pnlByDayOfWeek(trades: ClosedTrade[]): DayStat[] {
  const stats = HEBREW_DAYS.map(day => ({ day, totalPnl: 0, tradeCount: 0 }))
  for (const t of trades) {
    if (t.realizedPnl == null) continue
    const idx = t.closedAt.getDay()
    stats[idx].totalPnl += t.realizedPnl
    stats[idx].tradeCount++
  }
  return stats
}

// Realized P&L grouped by close hour (0-23), only hours that appear in data.
// Uses the BROWSER's local timezone for the same reason as pnlByDayOfWeek —
// the chart should reflect the user's wall-clock hours, not UTC.
export function pnlByHour(trades: ClosedTrade[]): HourStat[] {
  const hourMap = new Map<number, HourStat>()
  for (const t of trades) {
    if (t.realizedPnl == null) continue
    const hour = t.closedAt.getHours()
    const existing = hourMap.get(hour)
    if (existing) {
      existing.totalPnl += t.realizedPnl
      existing.tradeCount++
    } else {
      hourMap.set(hour, { hour, totalPnl: t.realizedPnl, tradeCount: 1 })
    }
  }
  return Array.from(hourMap.values()).sort((a, b) => a.hour - b.hour)
}
