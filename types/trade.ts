// Shared domain types for trade logic.
// ClosedTrade uses plain number (caller converts Prisma Decimal with .toNumber()).

export interface ClosedTrade {
  id: string
  ticker: string
  direction: 'Long' | 'Short'
  setupType: string | null
  openedAt: Date
  closedAt: Date
  actualR: number
  realizedPnl: number
  avgEntryPrice: number
  avgExitPrice: number | null
  stopPrice: number | null
  totalQuantityOpened: number
  result: string | null
  executionQuality: number | null
}

// Parsed, normalized shape of one IBKR Flex execution before FIFO processing.
export interface NormalizedExecution {
  brokerExecId: string
  brokerOrderId?: string
  brokerTradeId?: string
  ticker: string
  assetClass?: string  // e.g. 'STK', 'OPT', 'FUT' — used for STK validation
  side: 'BUY' | 'SELL' | 'SSHORT'
  quantity: number   // always positive
  price: number
  commission: number
  executedAt: Date
  currency?: string
  exchange?: string
  orderType?: string
  rawPayload: Record<string, unknown>
  brokerClientAccountId?: string
}

// Minimal snapshot of an existing open Trade passed to FIFO logic.
// Caller converts Prisma Decimal fields with .toNumber() before passing.
export interface OpenTradeSnapshot {
  id: string
  direction: 'Long' | 'Short'
  avgEntryPrice: number
  totalQuantity: number        // current open quantity (positive)
  totalQuantityOpened: number  // cumulative opened (for R calc basis)
  totalCommission: number
  realizedPnl: number          // accumulated from prior partial closes
  openedAt: Date
  stopPrice: number | null
}

// --- FIFO output shapes ---

export interface TradeCreate {
  ticker: string
  assetType: 'STK'
  direction: 'Long' | 'Short'
  status: 'Open'
  openedAt: Date
  avgEntryPrice: number
  totalQuantity: number
  totalQuantityOpened: number
  multiplier: 1
  totalCommission: number
  realizedPnl: number
  stopPrice: number | null
}

export interface TradeUpdate {
  avgEntryPrice?: number
  avgExitPrice?: number
  totalQuantity?: number
  totalQuantityOpened?: number
  totalCommission?: number
  realizedPnl?: number
  status?: 'Open' | 'Closed'
  closedAt?: Date
  actualR?: number | null
  result?: 'Win' | 'Loss' | 'Breakeven' | null
}

export interface OrderCreate {
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  commission: number
  executedAt: Date
  brokerExecId: string
  brokerOrderId?: string
  brokerTradeId?: string
  brokerClientAccountId?: string
  currency?: string
  exchange?: string
  orderType?: string
  rawPayload: Record<string, unknown>
}

export type FifoAction =
  | { type: 'OPEN';     tradeCreate: TradeCreate; orderCreate: OrderCreate }
  | { type: 'SCALE_IN'; tradeId: string; tradeUpdate: TradeUpdate; orderCreate: OrderCreate }
  | { type: 'REDUCE';   tradeId: string; tradeUpdate: TradeUpdate; orderCreate: OrderCreate }
  | { type: 'CLOSE';    tradeId: string; tradeUpdate: TradeUpdate; orderCreate: OrderCreate }
  | {
      type: 'REVERSAL'
      close: { tradeId: string; tradeUpdate: TradeUpdate; orderCreate: OrderCreate }
      open:  { tradeCreate: TradeCreate; orderCreate: OrderCreate }
    }
