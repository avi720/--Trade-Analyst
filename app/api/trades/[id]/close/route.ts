import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processExecutions } from '@/lib/ibkr/process-executions'
import { validateCloseShape, validateCloseAgainstTrade, modifiedStopNote, type ClosePayloadShape } from '@/lib/trade/validate-close'
import type { NormalizedExecution } from '@/types/trade'
import type { TablesUpdate } from '@/lib/db/types'

type ClosePayload = ClosePayloadShape

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ClosePayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  {
    const err = validateCloseShape(body)
    if (err) return NextResponse.json({ error: err.message }, { status: err.status })
  }

  const admin = createAdminClient()

  // Load the Trade and confirm it's a manual + Open trade owned by this user.
  const { data: trade, error: tradeErr } = await admin
    .from('Trade')
    .select('id, userId, ticker, direction, status, source, totalQuantity, stopPrice, targetPrice, notes')
    .eq('id', id)
    .eq('userId', user.id)
    .maybeSingle()

  if (tradeErr || !trade) {
    return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
  }
  if (trade.source !== 'manual') {
    return NextResponse.json({ error: 'Only manual trades can be closed via this endpoint' }, { status: 403 })
  }
  if (trade.status !== 'Open') {
    return NextResponse.json({ error: 'Trade is not Open' }, { status: 409 })
  }
  if (!trade.totalQuantity || trade.totalQuantity <= 0) {
    return NextResponse.json({ error: 'Trade has no open quantity to close' }, { status: 409 })
  }

  // Cross-field guards against the loaded trade row.
  {
    const err = validateCloseAgainstTrade(body, {
      stopPrice: trade.stopPrice,
      targetPrice: trade.targetPrice,
    })
    if (err) return NextResponse.json({ error: err.message }, { status: err.status })
  }

  // Build a single closing execution with the opposite side of the trade direction.
  const closeSide: 'BUY' | 'SELL' = trade.direction === 'Long' ? 'SELL' : 'BUY'
  const executedAt = new Date(`${body.closeDate}T${body.closeTime}:00Z`)
  const brokerExecId = `MANUAL-CLOSE-${trade.id}-${executedAt.getTime()}`

  const exec: NormalizedExecution = {
    brokerExecId,
    ticker: trade.ticker,
    assetClass: 'STK',
    side: closeSide,
    quantity: trade.totalQuantity,
    price: body.closePrice,
    commission: body.closeCommission ?? 0,
    executedAt,
    currency: 'USD', // fallback — Order.currency stays for the close; trade currency itself doesn't move
    orderType: undefined,
    netCash: null,
    commissionCurrency: 'USD',
    orderTimeIso: null,
  }

  const results = await processExecutions([exec], user.id)
  const r = results[0]
  if (r.status !== 'PROCESSED') {
    return NextResponse.json({
      error: 'Failed to close trade',
      detail: r.error ?? r.status,
    }, { status: 500 })
  }

  // Patch close-time annotations on the Trade.
  const update: TablesUpdate<'Trade'> = { closeReason: body.closeReason }
  if (body.wouldChange?.trim()) update.wouldChange = body.wouldChange.trim()
  if (body.executionQuality != null && Number.isFinite(body.executionQuality)) {
    update.executionQuality = body.executionQuality
  }
  if (body.closeReason === 'modified_stop' && body.modifiedStopPrice != null) {
    const stopLine = modifiedStopNote(body.modifiedStopPrice)
    const existingNotes = (trade.notes as string | null) ?? ''
    update.notes = existingNotes ? `${existingNotes}\n${stopLine}` : stopLine
  }

  const { error: updErr } = await admin
    .from('Trade')
    .update(update)
    .eq('id', trade.id)
    .eq('userId', user.id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tradeId: trade.id })
}
