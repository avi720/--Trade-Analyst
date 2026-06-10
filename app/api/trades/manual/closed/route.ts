import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildExecutions, extractAnnotations } from '@/lib/trade/manual-entry'
import { processExecutions } from '@/lib/ibkr/process-executions'
import { recomputeActualR } from '@/lib/trade/recompute-actual-r'
import type { ManualLeg } from '@/lib/trade/manual-entry'
import { validateCloseShape, validateCloseAgainstTrade, modifiedStopNote, type ClosePayloadShape } from '@/lib/trade/validate-close'
import type { TablesUpdate } from '@/lib/db/types'

type ClosePayload = ClosePayloadShape

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let open: ManualLeg
  let close: ClosePayload
  try {
    const body = await req.json()
    open = body.open
    close = body.close
    if (!open || !close) {
      return NextResponse.json({ error: 'open and close required' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate close payload server-side — the open leg supplies the cross-field context.
  {
    const shapeErr = validateCloseShape(close)
    if (shapeErr) return NextResponse.json({ error: shapeErr.message }, { status: shapeErr.status })
    const ctxErr = validateCloseAgainstTrade(close, {
      stopPrice: open.stopPrice,
      targetPrice: open.targetPrice,
    })
    if (ctxErr) return NextResponse.json({ error: ctxErr.message }, { status: ctxErr.status })
  }

  // Build the two legs. Close-leg side is the opposite of open-leg side.
  const openLeg: ManualLeg = { ...open }
  const closeLeg: ManualLeg = {
    ticker: open.ticker,
    date: close.closeDate,
    time: close.closeTime,
    side: open.side === 'BUY' ? 'SELL' : 'BUY',
    quantity: open.quantity,
    price: close.closePrice,
    commission: close.closeCommission ?? 0,
    currency: open.currency,
    commissionCurrency: open.commissionCurrency,
    broker: open.broker,
    timezone: open.timezone,
    // No annotations on the close leg itself; close-time annotations apply to
    // the Trade (handled below).
  }

  const { executions, errors } = buildExecutions([openLeg, closeLeg])
  if (errors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 422 })
  }

  const results = await processExecutions(executions, user.id)

  // Find the tradeId that was opened by the open leg (results[0]).
  const openResult = results[0]
  if (!openResult || openResult.status !== 'PROCESSED' || !openResult.tradeId) {
    return NextResponse.json({
      error: 'Failed to open trade',
      details: results,
    }, { status: 500 })
  }
  const tradeId = openResult.tradeId

  const admin = createAdminClient()

  // Compose annotations: open-leg annotations + close-time annotations.
  const openAnn = extractAnnotations(openLeg)
  const trade_update: TablesUpdate<'Trade'> = { ...openAnn } as TablesUpdate<'Trade'>
  trade_update.source = 'manual'
  trade_update.closeReason = close.closeReason
  if (close.wouldChange?.trim()) trade_update.wouldChange = close.wouldChange.trim()
  if (close.executionQuality != null && Number.isFinite(close.executionQuality)) {
    trade_update.executionQuality = close.executionQuality
  }

  // If modified_stop, append the modified-stop price to notes (per plan).
  if (close.closeReason === 'modified_stop' && close.modifiedStopPrice != null) {
    const stopLine = modifiedStopNote(close.modifiedStopPrice)
    const existingNotes = (openAnn.notes as string | undefined) || ''
    trade_update.notes = existingNotes
      ? `${existingNotes}\n${stopLine}`
      : stopLine
  }

  const { error: updErr } = await admin
    .from('Trade')
    .update(trade_update)
    .eq('id', tradeId)
    .eq('userId', user.id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // The stopPrice is only persisted above (after the FIFO close already ran),
  // so the CLOSE action computed actualR = null. Recompute it now that the stop
  // is on the Trade, so the research-tab R metrics populate.
  await recomputeActualR(admin, tradeId, user.id)

  return NextResponse.json({
    ok: true,
    tradeId,
    results,
  })
}
