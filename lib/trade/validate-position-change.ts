/**
 * Shared validation for the two position-change payloads:
 *   - POST /api/trades/[id]/add-to-position     (scale into an open position)
 *   - POST /api/trades/[id]/reduce-position     (trim part of an open position)
 *
 * Same split as validate-close.ts: a stateless shape pass the route can run
 * before touching the DB, then a cross-field pass that needs the loaded trade.
 * Keeping both routes on one validator is what stops them drifting apart.
 */

/** Longest reason text accepted. Trade.notes accumulates lines, so keep each modest. */
export const MAX_REASON_LENGTH = 1000

export interface PositionChangePayload {
  quantity: number
  price: number
  date: string // YYYY-MM-DD
  time: string // HH:MM
  commission?: number
  /** Optional free text appended after the fixed note prefix. */
  reason?: string
}

export interface PositionChangeError {
  message: string
  status: 422
}

/** Phase 1: body-shape checks, independent of the trade row. */
export function validatePositionChangeShape(
  payload: PositionChangePayload,
): PositionChangeError | null {
  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    return { message: 'quantity must be positive', status: 422 }
  }
  if (!Number.isFinite(payload.price) || payload.price <= 0) {
    return { message: 'price must be positive', status: 422 }
  }
  if (
    payload.commission != null &&
    (!Number.isFinite(payload.commission) || payload.commission < 0)
  ) {
    return { message: 'commission must be non-negative', status: 422 }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    return { message: 'date must be YYYY-MM-DD', status: 422 }
  }
  if (!/^\d{2}:\d{2}$/.test(payload.time)) {
    return { message: 'time must be HH:MM', status: 422 }
  }
  if (payload.reason != null && payload.reason.length > MAX_REASON_LENGTH) {
    return { message: `reason must be at most ${MAX_REASON_LENGTH} characters`, status: 422 }
  }
  return null
}

/**
 * Phase 2, reduce only: the quantity sold must be strictly smaller than what is
 * open.
 *
 * Equal would be a full close — that has to go through the close modal, which
 * collects closeReason / executionQuality / wouldChange. Larger would flip the
 * position into a reversal, which no modal in the app is meant to produce.
 * Both are rejected with a message naming the right path.
 */
export function validateReduceAgainstTrade(
  payload: PositionChangePayload,
  ctx: { totalQuantity: number },
): PositionChangeError | null {
  if (payload.quantity === ctx.totalQuantity) {
    return {
      message: 'מכירה של כל הכמות הפתוחה היא סגירת הטרייד — השתמש בכפתור "סגירת טרייד".',
      status: 422,
    }
  }
  if (payload.quantity > ctx.totalQuantity) {
    return {
      message: `לא ניתן למכור ${payload.quantity} — פתוחות רק ${ctx.totalQuantity} יחידות.`,
      status: 422,
    }
  }
  return null
}
