/**
 * Shared validation for close-time payloads.
 *
 * Used by:
 *   - app/api/trades/[id]/close/route.ts            (closing a previously-opened manual trade)
 *   - app/api/trades/manual/closed/route.ts         (open + close in one submission)
 *
 * Both routes accept the same fields with the same rules. Centralising here
 * keeps the two handlers in lockstep — a new closeReason value or rule change
 * touches one file.
 *
 * Validation is split into two phases so the [id]/close route can run shape
 * checks before the DB load:
 *   - validateCloseShape(payload)         — body-level checks; needs no context
 *   - validateCloseAgainstTrade(payload,  — original_stop / target cross-field guards;
 *                               context)    needs the open trade's stopPrice / targetPrice
 *
 * Callers that have both shape + trade up-front (the manual/closed route, which
 * uses the open-leg payload as context) can call both back-to-back.
 */

import { CLOSE_REASON_KEYS, type CloseReasonKey } from '@/lib/constants/trade-options'

export interface ClosePayloadShape {
  closePrice: number
  closeDate: string
  closeTime: string
  closeCommission?: number
  closeReason: CloseReasonKey
  modifiedStopPrice?: number | null
  wouldChange?: string
  executionQuality?: number | null
}

export interface CloseContext {
  /** Original stop price on the open trade (or open leg). */
  stopPrice: number | null | undefined
  /** Original target price on the open trade (or open leg). */
  targetPrice: number | null | undefined
}

export interface ClosePayloadError {
  message: string
  /** HTTP status the route should return. 422 for body validation. */
  status: 422
}

/**
 * Phase 1: stateless body-shape checks. Independent of the trade row.
 * Order: closePrice → closeDate → closeTime → closeReason whitelist →
 *        modifiedStopPrice (when reason is modified_stop).
 */
export function validateCloseShape(payload: ClosePayloadShape): ClosePayloadError | null {
  if (!Number.isFinite(payload.closePrice) || payload.closePrice <= 0) {
    return { message: 'closePrice must be positive', status: 422 }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.closeDate)) {
    return { message: 'closeDate must be YYYY-MM-DD', status: 422 }
  }
  if (!/^\d{2}:\d{2}$/.test(payload.closeTime)) {
    return { message: 'closeTime must be HH:MM', status: 422 }
  }
  if (!CLOSE_REASON_KEYS.includes(payload.closeReason)) {
    return { message: 'Invalid closeReason', status: 422 }
  }
  if (
    payload.closeReason === 'modified_stop' &&
    (payload.modifiedStopPrice == null ||
      !Number.isFinite(payload.modifiedStopPrice) ||
      payload.modifiedStopPrice <= 0)
  ) {
    return { message: 'closeReason=modified_stop requires modifiedStopPrice', status: 422 }
  }
  return null
}

/**
 * Phase 2: cross-field checks that depend on the open trade / leg.
 * Verifies that original_stop and target reasons have the corresponding price set.
 */
export function validateCloseAgainstTrade(
  payload: ClosePayloadShape,
  ctx: CloseContext,
): ClosePayloadError | null {
  if (
    payload.closeReason === 'original_stop' &&
    (ctx.stopPrice == null || !Number.isFinite(ctx.stopPrice))
  ) {
    return {
      message: 'closeReason=original_stop requires the trade to have a stopPrice',
      status: 422,
    }
  }
  if (
    payload.closeReason === 'target' &&
    (ctx.targetPrice == null || !Number.isFinite(ctx.targetPrice))
  ) {
    return {
      message: 'closeReason=target requires the trade to have a targetPrice',
      status: 422,
    }
  }
  return null
}

/**
 * Format the "סטופ שונה" note appended to Trade.notes when closeReason=modified_stop.
 * Centralised so both routes produce byte-identical text — important for the
 * search-tab "filter by notes" path that expects this canonical wording.
 */
export function modifiedStopNote(modifiedStopPrice: number): string {
  return `סטופ שונה: ${modifiedStopPrice}`
}
