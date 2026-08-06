/**
 * Server-only pipeline behind the two position-change modals in the search tab:
 *
 *   kind='add'    → scale into an open position   (POST /api/trades/[id]/add-to-position)
 *   kind='reduce' → trim part of an open position (POST /api/trades/[id]/reduce-position)
 *
 * Both do the same thing — load + guard the trade, push one execution through
 * FIFO, then append the fixed-prefix note — differing only in the side of the
 * execution and in the reduce-specific quantity rule. Keeping it in one place
 * is what stops the two routes drifting, the same reason validate-close.ts
 * exists for the close pair.
 *
 * Deliberately NOT subject to the opening-only guard in
 * guard-position-mutations.ts: these routes ARE the sanctioned way to mutate an
 * existing position, and the guard's whole job is to send users here.
 *
 * NEVER import from a client component — pulls in the service-role admin client.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { processExecutions } from '@/lib/ibkr/process-executions'
import { appendNoteLine, formatPositionNote, type PositionNoteKind } from '@/lib/trade/position-notes'
import {
  validatePositionChangeShape,
  validateReduceAgainstTrade,
  type PositionChangePayload,
} from '@/lib/trade/validate-position-change'
import type { NormalizedExecution } from '@/types/trade'
import type { TablesUpdate } from '@/lib/db/types'

export type PositionChangeResult =
  | { ok: true; tradeId: string; ticker: string; noteAdded: boolean }
  | { ok: false; error: string; status: number }

export async function applyPositionChange(
  tradeId: string,
  userId: string,
  kind: PositionNoteKind,
  payload: PositionChangePayload,
): Promise<PositionChangeResult> {
  const shapeErr = validatePositionChangeShape(payload)
  if (shapeErr) return { ok: false, error: shapeErr.message, status: shapeErr.status }

  const admin = createAdminClient()

  const { data: trade, error: tradeErr } = await admin
    .from('Trade')
    .select('id, userId, ticker, direction, status, source, totalQuantity, notes')
    .eq('id', tradeId)
    .eq('userId', userId)
    .maybeSingle()

  if (tradeErr || !trade) {
    return { ok: false, error: 'Trade not found', status: 404 }
  }
  // Same gate as the close route: broker-sourced trades mirror IBKR and must
  // not be hand-edited, or the next sync would fight the manual row.
  if (trade.source !== 'manual') {
    return { ok: false, error: 'ניתן לשנות בדרך זו טריידים שהוזנו ידנית בלבד.', status: 403 }
  }
  if (trade.status !== 'Open') {
    return { ok: false, error: 'הטרייד אינו פתוח.', status: 409 }
  }
  if (!trade.totalQuantity || trade.totalQuantity <= 0) {
    return { ok: false, error: 'לטרייד אין כמות פתוחה.', status: 409 }
  }

  if (kind === 'reduce') {
    const reduceErr = validateReduceAgainstTrade(payload, { totalQuantity: trade.totalQuantity })
    if (reduceErr) return { ok: false, error: reduceErr.message, status: reduceErr.status }
  }

  // Adding money moves with the position; trimming moves against it.
  const isLong = trade.direction === 'Long'
  const side: 'BUY' | 'SELL' =
    kind === 'add' ? (isLong ? 'BUY' : 'SELL') : (isLong ? 'SELL' : 'BUY')

  // Inherit broker + currency from the opening Order so every Order on this
  // Trade shares one identity. Falls back rather than inventing a value.
  const { data: openingOrder } = await admin
    .from('Order')
    .select('broker, currency, commissionCurrency')
    .eq('tradeId', trade.id)
    .eq('userId', userId)
    .order('executedAt', { ascending: true })
    .limit(1)
    .maybeSingle()

  const currency = openingOrder?.currency ?? 'USD'
  const executedAt = new Date(`${payload.date}T${payload.time}:00Z`)
  const prefix = kind === 'add' ? 'MANUAL-ADD' : 'MANUAL-REDUCE'
  const brokerExecId = `${prefix}-${trade.id}-${executedAt.getTime()}`

  const exec: NormalizedExecution = {
    brokerExecId,
    ticker: trade.ticker,
    assetClass: 'STK',
    side,
    quantity: payload.quantity,
    price: payload.price,
    commission: payload.commission ?? 0,
    executedAt,
    currency,
    orderType: undefined,
    netCash: null,
    commissionCurrency: openingOrder?.commissionCurrency ?? currency,
    orderTimeIso: null,
    broker: openingOrder?.broker ?? null,
  }

  // FIFO decides the actual action from the current DB state. The guards above
  // mean it should be SCALE_IN or REDUCE; processExecutions' own optimistic
  // guard is what protects against the position moving under us mid-request.
  const results = await processExecutions([exec], userId)
  const r = results[0]

  if (r.status === 'SKIPPED_DUPLICATE') {
    return {
      ok: false,
      error: 'ביצוע זהה כבר נרשם על הטרייד הזה (אותו תאריך ושעה). שנה את השעה או בדוק בפרטי הטרייד.',
      status: 409,
    }
  }
  if (r.status !== 'PROCESSED') {
    return { ok: false, error: r.error ?? `Failed to ${kind} position`, status: 500 }
  }

  // Fixed-prefix note, composed here so the client can never alter the wording.
  // No reason given → nothing is written to notes at all.
  const noteLine = formatPositionNote(kind, payload.date, payload.reason)
  if (noteLine) {
    const update: TablesUpdate<'Trade'> = {
      notes: appendNoteLine(trade.notes as string | null, noteLine),
    }
    const { error: updErr } = await admin
      .from('Trade')
      .update(update)
      .eq('id', trade.id)
      .eq('userId', userId)

    if (updErr) return { ok: false, error: updErr.message, status: 500 }
  }

  return { ok: true, tradeId: trade.id, ticker: trade.ticker, noteAdded: noteLine !== null }
}
