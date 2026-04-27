// Pure calculation functions for open position metrics.
// All inputs use plain number (Supabase returns NUMERIC as number).

export interface OpenPositionTrade {
  direction: 'Long' | 'Short'
  avgEntryPrice: number
  totalQuantity: number   // current open quantity (positive)
  stopPrice: number | null
  lastKnownPrice: number | null
}

/** Unrealized P&L in dollars. Returns null when price unavailable. */
export function unrealizedPnl(trade: OpenPositionTrade): number | null {
  if (trade.lastKnownPrice === null || trade.lastKnownPrice === undefined) return null
  const diff =
    trade.direction === 'Long'
      ? trade.lastKnownPrice - trade.avgEntryPrice
      : trade.avgEntryPrice - trade.lastKnownPrice
  return diff * trade.totalQuantity
}

/** Unrealized P&L as a percentage of cost basis. Returns null when price unavailable. */
export function unrealizedPct(trade: OpenPositionTrade): number | null {
  const pnl = unrealizedPnl(trade)
  if (pnl === null) return null
  const costBasis = trade.avgEntryPrice * trade.totalQuantity
  if (Math.abs(costBasis) < 0.0001) return null
  return (pnl / costBasis) * 100
}

/**
 * Current R multiple based on unrealized P&L vs planned risk per share.
 * Returns null when: no lastKnownPrice, no stopPrice, or risk ≤ 0.0001 (prevents divide-by-zero).
 */
export function currentR(trade: OpenPositionTrade): number | null {
  if (trade.lastKnownPrice === null || trade.lastKnownPrice === undefined) return null
  if (trade.stopPrice === null || trade.stopPrice === undefined) return null

  const riskPerShare =
    trade.direction === 'Long'
      ? trade.avgEntryPrice - trade.stopPrice
      : trade.stopPrice - trade.avgEntryPrice

  if (riskPerShare < 0.0001) return null

  const pnlPerShare =
    trade.direction === 'Long'
      ? trade.lastKnownPrice - trade.avgEntryPrice
      : trade.avgEntryPrice - trade.lastKnownPrice

  return pnlPerShare / riskPerShare
}

/** Position exposure (cost basis). Always positive, direction-agnostic. */
export function exposure(trade: Pick<OpenPositionTrade, 'avgEntryPrice' | 'totalQuantity'>): number {
  return trade.avgEntryPrice * trade.totalQuantity
}

/** Human-readable relative time string for Hebrew UI ("לפני X דקות / שעות / ימים"). */
export function relativeTimeHe(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const ms = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'עכשיו'
  if (minutes < 60) return `לפני ${minutes} דק'`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `לפני ${hours} שע'`
  const days = Math.floor(hours / 24)
  return `לפני ${days} ימים`
}

/** Format USD number with sign and 2 decimal places. */
export function formatUsd(value: number): string {
  const abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value >= 0 ? `+$${abs}` : `-$${abs}`
}

/** Format R multiple with sign and 2 decimal places. */
export function formatR(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`
}
