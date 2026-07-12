import { z } from 'zod'
import type { NormalizedExecution } from '@/types/trade'
import {
  CURRENCIES,
  BROKERS,
  validateSetupType,
  validateEmotionalState,
} from '@/lib/constants/trade-options'
import { localToUtcIso } from './tz'

// ─── Zod schemas (structural validation at the route layer) ──────────────
// Business-logic validation (setupType/emotionalState shape, cross-field
// checks) stays in validateLeg below — this schema only enforces shape,
// types, and ranges. Routes apply this BEFORE buildExecutions.
export const MAX_LEGS_PER_REQUEST = 500

export const manualLegSchema = z.object({
  ticker: z.string().min(1).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().finite().positive(),
  price: z.number().finite().positive(),
  commission: z.number().finite().min(0),
  currency: z.enum(CURRENCIES),

  commissionCurrency: z.enum(CURRENCIES).optional(),
  orderType: z.string().max(40).optional(),
  orderPlacedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  orderPlacedTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  broker: z.enum(BROKERS).optional(),
  timezone: z.string().max(64).optional(),

  setupType: z.string().max(80).nullable().optional(),
  emotionalState: z.string().max(40).nullable().optional(),
  stopPrice: z.number().finite().positive().nullable().optional(),
  targetPrice: z.number().finite().positive().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  didRight: z.string().max(4000).nullable().optional(),
})

export const manualLegsSchema = z
  .array(manualLegSchema)
  .min(1, 'legs must be a non-empty array')
  .max(MAX_LEGS_PER_REQUEST, `legs must contain at most ${MAX_LEGS_PER_REQUEST} entries`)

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
  broker?: string               // ברוקר (one of BROKERS)
  timezone?: string             // IANA tz of date/time fields (defaults to UTC for backward compat)

  // ─── Personal annotation fields (Trade-level) ────────────────────────────
  // NOTE: wouldChange was removed from open-trade entry — it only makes sense
  // at close time and is set via the manual-close flow.
  setupType?: string
  emotionalState?: string
  stopPrice?: number | null
  targetPrice?: number | null
  notes?: string
  didRight?: string
}

export interface ManualEntryError {
  field: string
  message: string
}

const CURRENCY_SET = new Set<string>(CURRENCIES as readonly string[])
const BROKER_SET = new Set<string>(BROKERS as readonly string[])

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

  const currency = leg.currency?.trim().toUpperCase() ?? ''
  if (!currency) errors.push({ field: `${p}.currency`, message: 'Currency required' })
  else if (!CURRENCY_SET.has(currency)) errors.push({ field: `${p}.currency`, message: `Currency must be one of ${CURRENCIES.join(', ')}` })

  if (leg.commissionCurrency) {
    const cc = leg.commissionCurrency.trim().toUpperCase()
    if (!CURRENCY_SET.has(cc)) errors.push({ field: `${p}.commissionCurrency`, message: `commissionCurrency must be one of ${CURRENCIES.join(', ')}` })
  }

  if (leg.broker) {
    const b = leg.broker.trim()
    if (!BROKER_SET.has(b)) errors.push({ field: `${p}.broker`, message: `broker must be one of ${BROKERS.join(', ')}` })
  }

  const setupErr = validateSetupType(leg.setupType)
  if (setupErr) errors.push({ field: `${p}.setupType`, message: setupErr })

  const emotionErr = validateEmotionalState(leg.emotionalState)
  if (emotionErr) errors.push({ field: `${p}.emotionalState`, message: emotionErr })

  return errors
}

export function buildExecution(leg: ManualLeg, index: number): NormalizedExecution {
  const ticker = leg.ticker.trim().toUpperCase()
  const tz = leg.timezone && leg.timezone !== 'UTC' ? leg.timezone : null
  const executedAt = new Date(
    tz ? localToUtcIso(leg.date, leg.time, tz) : `${leg.date}T${leg.time}:00Z`
  )
  const brokerExecId = `MANUAL-${ticker}-${executedAt.getTime()}-${index}`

  // Compute ISO timestamp for Order.orderTime if the user provided an order placement date.
  // Stored as _manualOrderTime so buildOrderInsert can bypass IBKR date parsing.
  let manualOrderTimeISO: string | undefined
  if (leg.orderPlacedDate && /^\d{4}-\d{2}-\d{2}$/.test(leg.orderPlacedDate)) {
    const t =
      leg.orderPlacedTime && /^\d{2}:\d{2}$/.test(leg.orderPlacedTime)
        ? leg.orderPlacedTime
        : leg.time // fall back to executedAt time if not provided
    manualOrderTimeISO = tz
      ? localToUtcIso(leg.orderPlacedDate, t, tz)
      : new Date(`${leg.orderPlacedDate}T${t}:00Z`).toISOString()
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
    // netCash is IBKR-only — manual entries don't populate it.
    netCash: null,
    commissionCurrency:
      leg.commissionCurrency?.trim().toUpperCase() ||
      leg.currency.trim().toUpperCase(),
    orderTimeIso: manualOrderTimeISO ?? null,
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
import type { TablesUpdate } from '@/lib/db/types'

export function extractAnnotations(leg: ManualLeg): TablesUpdate<'Trade'> {
  const ann: TablesUpdate<'Trade'> = {}
  if (leg.setupType?.trim()) ann.setupType = leg.setupType.trim()
  if (leg.emotionalState?.trim()) ann.emotionalState = leg.emotionalState.trim()
  if (leg.stopPrice != null && Number.isFinite(leg.stopPrice)) ann.stopPrice = leg.stopPrice
  if (leg.targetPrice != null && Number.isFinite(leg.targetPrice)) ann.targetPrice = leg.targetPrice
  if (leg.notes?.trim()) ann.notes = leg.notes.trim()
  if (leg.didRight?.trim()) ann.didRight = leg.didRight.trim()
  return ann
}
