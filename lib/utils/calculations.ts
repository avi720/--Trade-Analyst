import type { ClosedTrade } from '@/types/trade'

export interface TradeStats {
  totalTrades: number
  rTradeCount: number   // trades that have an R-multiple (stop price set)
  winRate: number
  avgR: number          // R-based: over trades with actualR only
  profitFactor: number  // $-based; 999 when there are no losses
  expectancy: number    // R-based: over trades with actualR only
  maxDrawdown: number   // $-based: peak-to-trough on cumulative realizedPnl
  totalPnl: number
  avgWin: number        // $-based: avg realizedPnl of winning trades
  avgLoss: number       // $-based: avg realizedPnl of losing trades
}

export interface EquityPoint {
  date: number   // epoch ms — numeric so recharts' type="number" time axis can plot it
  cumulativeR: number
}

export interface RBin {
  label: string
  count: number
}

export interface SetupStat {
  setupType: string
  winRate: number
  avgR: number
  count: number
}

export function calcStats(trades: ClosedTrade[]): TradeStats {
  if (trades.length === 0) {
    return { totalTrades: 0, rTradeCount: 0, winRate: 0, avgR: 0, profitFactor: 0, expectancy: 0, maxDrawdown: 0, totalPnl: 0, avgWin: 0, avgLoss: 0 }
  }

  // $-based win/loss classification — counts every trade, including those without an R-multiple
  const winners = trades.filter(t => t.realizedPnl > 0)
  const losers = trades.filter(t => t.realizedPnl < 0)

  const winRate = winners.length / trades.length

  const grossWinUsd = winners.reduce((s, t) => s + t.realizedPnl, 0)
  const grossLossUsd = losers.reduce((s, t) => s + Math.abs(t.realizedPnl), 0)
  const profitFactor = grossLossUsd === 0 ? 999 : grossWinUsd / grossLossUsd

  const avgWin = winners.length > 0 ? grossWinUsd / winners.length : 0
  const avgLoss = losers.length > 0 ? -(grossLossUsd / losers.length) : 0

  const totalPnl = trades.reduce((s, t) => s + t.realizedPnl, 0)

  // Max drawdown: largest peak-to-trough drop in cumulative realizedPnl ($)
  const sortedByClose = [...trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())
  let peak = 0
  let cumPnl = 0
  let maxDrawdown = 0
  for (const t of sortedByClose) {
    cumPnl += t.realizedPnl
    if (cumPnl > peak) peak = cumPnl
    const dd = cumPnl - peak
    if (dd < maxDrawdown) maxDrawdown = dd
  }

  // R-based metrics — only over trades that have an R-multiple (stop price set)
  const rTrades = trades.filter((t): t is ClosedTrade & { actualR: number } => t.actualR != null)
  const avgR = rTrades.length > 0 ? rTrades.reduce((s, t) => s + t.actualR, 0) / rTrades.length : 0
  // Expectancy in R equals the mean R over rTrades
  const expectancy = avgR

  return {
    totalTrades: trades.length,
    rTradeCount: rTrades.length,
    winRate,
    avgR,
    profitFactor,
    expectancy,
    maxDrawdown,
    totalPnl,
    avgWin,
    avgLoss,
  }
}

export function equityCurve(trades: ClosedTrade[]): EquityPoint[] {
  const sorted = [...trades]
    .filter((t): t is ClosedTrade & { actualR: number } => t.actualR != null)
    .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())
  let cumR = 0
  return sorted.map(t => {
    cumR += t.actualR
    return { date: t.closedAt.getTime(), cumulativeR: cumR }
  })
}

const R_BINS: Array<{ label: string; min: number; max: number }> = [
  { label: '<-2R',     min: -Infinity, max: -2 },
  { label: '-2R–-1R',  min: -2,        max: -1 },
  { label: '-1R–0R',   min: -1,        max: 0  },
  { label: '0R–1R',    min: 0,         max: 1  },
  { label: '1R–2R',    min: 1,         max: 2  },
  { label: '>2R',      min: 2,         max: Infinity },
]

export function rDistribution(trades: ClosedTrade[]): RBin[] {
  const counts = R_BINS.map(b => ({ label: b.label, count: 0 }))
  for (const t of trades) {
    if (t.actualR == null) continue
    const r = t.actualR
    // Left-inclusive, right-exclusive: bin contains [min, max)
    const idx = R_BINS.findIndex(b => r >= b.min && r < b.max)
    if (idx !== -1) counts[idx].count++
  }
  return counts
}

export function setupPerformance(trades: ClosedTrade[]): SetupStat[] {
  const groups = new Map<string, ClosedTrade[]>()
  for (const t of trades) {
    const key = t.setupType ?? 'untagged'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  return Array.from(groups.entries()).map(([setupType, group]) => {
    const wins = group.filter(t => t.realizedPnl > 0)
    const rGroup = group.filter((t): t is ClosedTrade & { actualR: number } => t.actualR != null)
    return {
      setupType,
      winRate: wins.length / group.length,
      avgR: rGroup.length > 0 ? rGroup.reduce((s, t) => s + t.actualR, 0) / rGroup.length : 0,
      count: group.length,
    }
  })
}
