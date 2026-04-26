/**
 * FIFO trade matching — pure function, no DB calls.
 *
 * Input:  a NormalizedExecution + the current open trade for that ticker (if any).
 * Output: a FifoAction describing what DB writes to perform.
 *
 * For REVERSAL actions the caller MUST persist both writes atomically via the
 * `reverse_position` Postgres function (supabase.rpc('reverse_position', ...)).
 */

import type {
  NormalizedExecution,
  OpenTradeSnapshot,
  FifoAction,
  TradeCreate,
  TradeUpdate,
  OrderCreate,
} from '@/types/trade'

const MIN_RISK_PER_SHARE = 0.0001 // guard against near-zero stop distance → Infinity actualR

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function weightedAvg(prevAvg: number, prevQty: number, newPrice: number, newQty: number): number {
  return (prevAvg * prevQty + newPrice * newQty) / (prevQty + newQty)
}

function calcPnl(direction: 'Long' | 'Short', avgEntry: number, exitPrice: number, qty: number): number {
  return direction === 'Long'
    ? (exitPrice - avgEntry) * qty
    : (avgEntry - exitPrice) * qty
}

function calcActualR(
  totalRealizedPnl: number,
  avgEntryPrice: number,
  stopPrice: number | null,
  totalQuantityOpened: number,
): number | null {
  if (stopPrice === null) return null
  const riskPerShare = Math.abs(avgEntryPrice - stopPrice)
  if (riskPerShare < MIN_RISK_PER_SHARE || totalQuantityOpened === 0) return null
  return totalRealizedPnl / (riskPerShare * totalQuantityOpened)
}

function resultFromR(actualR: number | null): 'Win' | 'Loss' | 'Breakeven' | null {
  if (actualR === null) return null
  if (actualR > 0) return 'Win'
  if (actualR < 0) return 'Loss'
  return 'Breakeven'
}

function buildOrderCreate(exec: NormalizedExecution, side: 'BUY' | 'SELL', commission: number): OrderCreate {
  return {
    side,
    quantity: exec.quantity,
    price: exec.price,
    commission,
    executedAt: exec.executedAt,
    brokerExecId: exec.brokerExecId,
    brokerOrderId: exec.brokerOrderId,
    brokerTradeId: exec.brokerTradeId,
    brokerClientAccountId: exec.brokerClientAccountId,
    currency: exec.currency,
    exchange: exec.exchange,
    orderType: exec.orderType,
    rawPayload: exec.rawPayload,
  }
}

function buildTradeCreate(
  exec: NormalizedExecution,
  direction: 'Long' | 'Short',
  quantity: number,
  commission: number,
): TradeCreate {
  return {
    ticker: exec.ticker,
    assetType: 'STK',
    direction,
    status: 'Open',
    openedAt: exec.executedAt,
    avgEntryPrice: exec.price,
    totalQuantity: quantity,
    totalQuantityOpened: quantity,
    multiplier: 1,
    totalCommission: commission,
    realizedPnl: 0,
    stopPrice: null,
  }
}

// ---------------------------------------------------------------------------
// main export
// ---------------------------------------------------------------------------

/**
 * Match a single normalized execution against the current open trade (if any).
 * Returns a FifoAction describing the DB changes needed.
 */
export function matchExecution(
  exec: NormalizedExecution,
  openTrade: OpenTradeSnapshot | null,
): FifoAction {
  const normalizedSide: 'BUY' | 'SELL' = exec.side === 'SSHORT' ? 'SELL' : exec.side

  // -------------------------------------------------------------------------
  // No open trade — this execution opens a new position
  // -------------------------------------------------------------------------
  if (!openTrade) {
    const direction: 'Long' | 'Short' = exec.side === 'BUY' ? 'Long' : 'Short'
    return {
      type: 'OPEN',
      tradeCreate: buildTradeCreate(exec, direction, exec.quantity, exec.commission),
      orderCreate: buildOrderCreate(exec, normalizedSide, exec.commission),
    }
  }

  const { direction, avgEntryPrice, totalQuantity, totalQuantityOpened, totalCommission, realizedPnl } = openTrade

  // -------------------------------------------------------------------------
  // Existing Long position
  // -------------------------------------------------------------------------
  if (direction === 'Long') {
    if (exec.side === 'BUY') {
      // Scale in
      const newAvgEntry = weightedAvg(avgEntryPrice, totalQuantity, exec.price, exec.quantity)
      const update: TradeUpdate = {
        avgEntryPrice: newAvgEntry,
        totalQuantity: totalQuantity + exec.quantity,
        totalQuantityOpened: totalQuantityOpened + exec.quantity,
        totalCommission: totalCommission + exec.commission,
      }
      return { type: 'SCALE_IN', tradeId: openTrade.id, tradeUpdate: update, orderCreate: buildOrderCreate(exec, 'BUY', exec.commission) }
    }

    // SELL against long
    const pnl = calcPnl('Long', avgEntryPrice, exec.price, exec.quantity)
    const newRealizedPnl = realizedPnl + pnl - exec.commission
    const newTotalCommission = totalCommission + exec.commission

    if (exec.quantity < totalQuantity) {
      // Partial close
      const update: TradeUpdate = {
        totalQuantity: totalQuantity - exec.quantity,
        realizedPnl: newRealizedPnl,
        totalCommission: newTotalCommission,
      }
      return { type: 'REDUCE', tradeId: openTrade.id, tradeUpdate: update, orderCreate: buildOrderCreate(exec, 'SELL', exec.commission) }
    }

    if (exec.quantity === totalQuantity) {
      // Full close
      const actualR = calcActualR(newRealizedPnl, avgEntryPrice, openTrade.stopPrice, totalQuantityOpened)
      const update: TradeUpdate = {
        totalQuantity: 0,
        avgExitPrice: exec.price,
        realizedPnl: newRealizedPnl,
        totalCommission: newTotalCommission,
        status: 'Closed',
        closedAt: exec.executedAt,
        actualR,
        result: resultFromR(actualR),
      }
      return { type: 'CLOSE', tradeId: openTrade.id, tradeUpdate: update, orderCreate: buildOrderCreate(exec, 'SELL', exec.commission) }
    }

    // Reversal: sell more than the open long position
    const closingQty = totalQuantity
    const newQty = exec.quantity - closingQty
    const closingCommission = exec.commission * (closingQty / exec.quantity)
    const openingCommission = exec.commission * (newQty / exec.quantity)

    const closingPnl = calcPnl('Long', avgEntryPrice, exec.price, closingQty)
    const closedRealizedPnl = realizedPnl + closingPnl - closingCommission
    const actualR = calcActualR(closedRealizedPnl, avgEntryPrice, openTrade.stopPrice, totalQuantityOpened)
    const closeUpdate: TradeUpdate = {
      totalQuantity: 0,
      avgExitPrice: exec.price,
      realizedPnl: closedRealizedPnl,
      totalCommission: totalCommission + closingCommission,
      status: 'Closed',
      closedAt: exec.executedAt,
      actualR,
      result: resultFromR(actualR),
    }
    return {
      type: 'REVERSAL',
      close: { tradeId: openTrade.id, tradeUpdate: closeUpdate, orderCreate: buildOrderCreate({ ...exec, quantity: closingQty }, 'SELL', closingCommission) },
      open: { tradeCreate: buildTradeCreate({ ...exec, quantity: newQty }, 'Short', newQty, openingCommission), orderCreate: buildOrderCreate({ ...exec, quantity: newQty }, 'SELL', openingCommission) },
    }
  }

  // -------------------------------------------------------------------------
  // Existing Short position
  // -------------------------------------------------------------------------

  if (exec.side === 'SSHORT' || (exec.side === 'SELL' && direction === 'Short')) {
    // Scale in to short
    const newAvgEntry = weightedAvg(avgEntryPrice, totalQuantity, exec.price, exec.quantity)
    const update: TradeUpdate = {
      avgEntryPrice: newAvgEntry,
      totalQuantity: totalQuantity + exec.quantity,
      totalQuantityOpened: totalQuantityOpened + exec.quantity,
      totalCommission: totalCommission + exec.commission,
    }
    return { type: 'SCALE_IN', tradeId: openTrade.id, tradeUpdate: update, orderCreate: buildOrderCreate(exec, 'SELL', exec.commission) }
  }

  // BUY against short (cover)
  const pnl = calcPnl('Short', avgEntryPrice, exec.price, exec.quantity)
  const newRealizedPnl = realizedPnl + pnl - exec.commission
  const newTotalCommission = totalCommission + exec.commission

  if (exec.quantity < totalQuantity) {
    const update: TradeUpdate = {
      totalQuantity: totalQuantity - exec.quantity,
      realizedPnl: newRealizedPnl,
      totalCommission: newTotalCommission,
    }
    return { type: 'REDUCE', tradeId: openTrade.id, tradeUpdate: update, orderCreate: buildOrderCreate(exec, 'BUY', exec.commission) }
  }

  if (exec.quantity === totalQuantity) {
    const actualR = calcActualR(newRealizedPnl, avgEntryPrice, openTrade.stopPrice, totalQuantityOpened)
    const update: TradeUpdate = {
      totalQuantity: 0,
      avgExitPrice: exec.price,
      realizedPnl: newRealizedPnl,
      totalCommission: newTotalCommission,
      status: 'Closed',
      closedAt: exec.executedAt,
      actualR,
      result: resultFromR(actualR),
    }
    return { type: 'CLOSE', tradeId: openTrade.id, tradeUpdate: update, orderCreate: buildOrderCreate(exec, 'BUY', exec.commission) }
  }

  // Reversal: cover more than open short → flip to long
  const closingQty = totalQuantity
  const newQty = exec.quantity - closingQty
  const closingCommission = exec.commission * (closingQty / exec.quantity)
  const openingCommission = exec.commission * (newQty / exec.quantity)

  const closingPnl = calcPnl('Short', avgEntryPrice, exec.price, closingQty)
  const closedRealizedPnl = realizedPnl + closingPnl - closingCommission
  const actualR = calcActualR(closedRealizedPnl, avgEntryPrice, openTrade.stopPrice, totalQuantityOpened)
  const closeUpdate: TradeUpdate = {
    totalQuantity: 0,
    avgExitPrice: exec.price,
    realizedPnl: closedRealizedPnl,
    totalCommission: totalCommission + closingCommission,
    status: 'Closed',
    closedAt: exec.executedAt,
    actualR,
    result: resultFromR(actualR),
  }
  return {
    type: 'REVERSAL',
    close: { tradeId: openTrade.id, tradeUpdate: closeUpdate, orderCreate: buildOrderCreate({ ...exec, quantity: closingQty }, 'BUY', closingCommission) },
    open: { tradeCreate: buildTradeCreate({ ...exec, quantity: newQty }, 'Long', newQty, openingCommission), orderCreate: buildOrderCreate({ ...exec, quantity: newQty }, 'BUY', openingCommission) },
  }
}
