import type { ClosedTrade } from '@/types/trade'

export interface TradeStats {
  totalTrades: number
  winRate: number
  avgR: number
  profitFactor: number  // 999 when there are no losses
  expectancy: number
  maxDrawdown: number
  totalPnl: number
  avgWin: number
  avgLoss: number
}

export interface EquityPoint {
  date: Date
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
    return { totalTrades: 0, winRate: 0, avgR: 0, profitFactor: 0, expectancy: 0, maxDrawdown: 0, totalPnl: 0, avgWin: 0, avgLoss: 0 }
  }

  const wins = trades.filter(t => t.actualR > 0)
  const losses = trades.filter(t => t.actualR < 0)

  const winRate = wins.length / trades.length
  const avgR = trades.reduce((s, t) => s + t.actualR, 0) / trades.length

  const grossWins = wins.reduce((s, t) => s + t.actualR, 0)
  const grossLosses = losses.reduce((s, t) => s + Math.abs(t.actualR), 0)
  const profitFactor = grossLosses === 0 ? 999 : grossWins / grossLosses

  const avgWin = wins.length > 0 ? grossWins / wins.length : 0
  const avgLoss = losses.length > 0 ? -(grossLosses / losses.length) : 0

  const expectancy = winRate * avgWin + (1 - winRate) * avgLoss

  const totalPnl = trades.reduce((s, t) => s + t.realizedPnl, 0)

  // Max drawdown: largest peak-to-trough drop in cumulative actualR
  const sorted = [...trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())
  let peak = 0
  let cumR = 0
  let maxDrawdown = 0
  for (const t of sorted) {
    cumR += t.actualR
    if (cumR > peak) peak = cumR
    const dd = cumR - peak
    if (dd < maxDrawdown) maxDrawdown = dd
  }

  return { totalTrades: trades.length, winRate, avgR, profitFactor, expectancy, maxDrawdown, totalPnl, avgWin, avgLoss }
}

export function equityCurve(trades: ClosedTrade[]): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())
  let cumR = 0
  return sorted.map(t => {
    cumR += t.actualR
    return { date: t.closedAt, cumulativeR: cumR }
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
    const wins = group.filter(t => t.actualR > 0)
    return {
      setupType,
      winRate: wins.length / group.length,
      avgR: group.reduce((s, t) => s + t.actualR, 0) / group.length,
      count: group.length,
    }
  })
}
