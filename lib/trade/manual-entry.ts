import type { NormalizedExecution } from '@/types/trade'

export interface ManualLeg {
  // ─── Required execution fields ───────────────────────────────────────────
  ticker: string
  date: string        // executedAt — YYYY-MM-DD (UTC)
  time: string        // executedAt — HH:MM (UTC)
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  commission: number
  currency: string

  // ─── Optional order-detail fields ────────────────────────────────────────
  commissionCurrency?: string   // מטבע עמלה (defaults to currency)
  orderType?: string            // LIMIT | MARKET | STOP | STOP LIMIT | MOO | MOC | …
  orderPlacedDate?: string      // when order was placed — YYYY-MM-DD
  orderPlacedTime?: string      // when order was placed — HH:MM
  broker?: string               // ברוקר

  // ─── Personal annotation fields (Trade-level) ────────────────────────────
  setupType?: string
  emotionalState?: string
  stopPrice?: number | null
  targetPrice?: number | null
  notes?: string
  didRight?: string
  wouldChange?: string
}

export interface ManualEntryError {
  field: string
  message: string
}

export function validateLeg(leg: ManualLeg, index: number): ManualEntryError[] {
  const errors: ManualEntryError[] = []
  const p = `legs[${index}]`

  if (!leg.ticker.trim()) errors.push({ field: `${p}.ticker`, message: 'Ticker required' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leg.date)) errors.push({ field: `${p}.date`, message: 'Date must be YYYY-MM-DD' })
  if (!/^\d{2}:\d{2}$/.test(leg.time)) errors.push({ field: `${p}.time`, message: 'Time must be HH:MM' })
  if (leg.side !== 'BUY' && leg.side !== 'SELL') errors.push({ field: `${p}.side`, message: 'Side must be BUY or SELL' })
  if (!Number.isFinite(leg.quantity) || leg.quantity <= 0) errors.push({ field: `${p}.quantity`, message: 'Quantity must be positive' })
  if (!Number.isFinite(leg.price) || leg.price <= 0) errors.push({ field: `${p}.price`, message: 'Price must be positive' })
  if (!Number.isFinite(leg.commission) || leg.commission < 0) errors.push({ field: `${p}.commission`, message: 'Commission must be non-negative' })
  if (!leg.currency.trim()) errors.push({ field: `${p}.currency`, message: 'Currency required' })

  return errors
}

export function buildExecution(leg: ManualLeg, index: number): NormalizedExecution {
  const ticker = leg.ticker.trim().toUpperCase()
  const executedAt = new Date(`${leg.date}T${leg.time}:00Z`)
  const brokerExecId = `MANUAL-${ticker}-${executedAt.getTime()}-${index}`

  // Compute ISO timestamp for Order.orderTime if the user provided an order placement date.
  // Stored as _manualOrderTime so buildOrderInsert can bypass IBKR date parsing.
  let manualOrderTimeISO: string | undefined
  if (leg.orderPlacedDate && /^\d{4}-\d{2}-\d{2}$/.test(leg.orderPlacedDate)) {
    const t =
      leg.orderPlacedTime && /^\d{2}:\d{2}$/.test(leg.orderPlacedTime)
        ? leg.orderPlacedTime
        : leg.time // fall back to executedAt time if not provided
    manualOrderTimeISO = new Date(`${leg.orderPlacedDate}T${t}:00Z`).toISOString()
  }

  return {
    brokerExecId,
    ticker,
    assetClass: 'STK',
    side: leg.side,
    quantity: leg.quantity,
    price: leg.price,
    commission: leg.commission,
    executedAt,
    currency: leg.currency.trim().toUpperCase(),
    orderType: leg.orderType?.trim() || undefined,
    rawPayload: {
      // Commission currency — picked up by buildOrderInsert as ibCommissionCurrency
      ibCommissionCurrency:
        leg.commissionCurrency?.trim().toUpperCase() ||
        leg.currency.trim().toUpperCase(),
      // Pre-parsed order-placement time (bypasses IBKR date parser in buildOrderInsert)
      ...(manualOrderTimeISO ? { _manualOrderTime: manualOrderTimeISO } : {}),
      // Broker name — informational, stored in rawPayload only
      ...(leg.broker?.trim() ? { broker: leg.broker.trim() } : {}),
    },
  }
}

export function buildExecutions(
  legs: ManualLeg[]
): { executions: NormalizedExecution[]; errors: ManualEntryError[] } {
  const errors: ManualEntryError[] = []
  const executions: NormalizedExecution[] = []

  for (let i = 0; i < legs.length; i++) {
    const legErrors = validateLeg(legs[i], i)
    if (legErrors.length > 0) {
      errors.push(...legErrors)
    } else {
      executions.push(buildExecution(legs[i], i))
    }
  }

  return { executions, errors }
}

/**
 * Extracts non-empty Trade-level annotation fields from a ManualLeg.
 * The result is ready to be passed to a Supabase `.update()` call.
 */
export function extractAnnotations(leg: ManualLeg): Record<string, unknown> {
  const ann: Record<string, unknown> = {}
  if (leg.setupType?.trim()) ann.setupType = leg.setupType.trim()
  if (leg.emotionalState?.trim()) ann.emotionalState = leg.emotionalState.trim()
  if (leg.stopPrice != null && Number.isFinite(leg.stopPrice)) ann.stopPrice = leg.stopPrice
  if (leg.targetPrice != null && Number.isFinite(leg.targetPrice)) ann.targetPrice = leg.targetPrice
  if (leg.notes?.trim()) ann.notes = leg.notes.trim()
  if (leg.didRight?.trim()) ann.didRight = leg.didRight.trim()
  if (leg.wouldChange?.trim()) ann.wouldChange = leg.wouldChange.trim()
  return ann
}
