import type { NormalizedExecution } from '@/types/trade'

export interface ManualLeg {
  ticker: string
  date: string      // YYYY-MM-DD
  time: string      // HH:MM
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  commission: number
  currency: string
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
    rawPayload: {},
  }
}

export function buildExecutions(legs: ManualLeg[]): { executions: NormalizedExecution[]; errors: ManualEntryError[] } {
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
