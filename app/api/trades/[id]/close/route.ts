import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processExecutions } from '@/lib/ibkr/process-executions'
import { CLOSE_REASON_KEYS, type CloseReasonKey } from '@/lib/constants/trade-options'
import type { NormalizedExecution } from '@/types/trade'

interface ClosePayload {
  closePrice: number
  closeDate: string
  closeTime: string
  closeCommission?: number
  closeReason: CloseReasonKey
  modifiedStopPrice?: number | null
  wouldChange?: string
  executionQuality?: number | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  if (!Number.isFinite(body.closePrice) || body.closePrice <= 0) {
    return NextResponse.json({ error: 'closePrice must be positive' }, { status: 422 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.closeDate)) {
    return NextResponse.json({ error: 'closeDate must be YYYY-MM-DD' }, { status: 422 })
  }
  if (!/^\d{2}:\d{2}$/.test(body.closeTime)) {
    return NextResponse.json({ error: 'closeTime must be HH:MM' }, { status: 422 })
  }
  if (!CLOSE_REASON_KEYS.includes(body.closeReason)) {
    return NextResponse.json({ error: 'Invalid closeReason' }, { status: 422 })
  }

  const admin = createAdminClient()

  // Load the Trade and confirm it's a manual + Open trade owned by this user.
  const { data: trade, error: tradeErr } = await admin
    .from('Trade')
    .select('id, userId, ticker, direction, status, source, totalQuantity, stopPrice, targetPrice, notes')
    .eq('id', params.id)
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

  if (body.closeReason === 'original_stop' && trade.stopPrice == null) {
    return NextResponse.json({ error: 'closeReason=original_stop requires the trade to have a stopPrice' }, { status: 422 })
  }
  if (body.closeReason === 'target' && trade.targetPrice == null) {
    return NextResponse.json({ error: 'closeReason=target requires the trade to have a targetPrice' }, { status: 422 })
  }
  if (body.closeReason === 'modified_stop' && (body.modifiedStopPrice == null || !Number.isFinite(body.modifiedStopPrice) || body.modifiedStopPrice <= 0)) {
    return NextResponse.json({ error: 'closeReason=modified_stop requires modifiedStopPrice' }, { status: 422 })
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
    rawPayload: {
      // Tag the close source so it's distinguishable in raw logs.
      _manualClose: true,
    },
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
  const update: Record<string, unknown> = { closeReason: body.closeReason }
  if (body.wouldChange?.trim()) update.wouldChange = body.wouldChange.trim()
  if (body.executionQuality != null && Number.isFinite(body.executionQuality)) {
    update.executionQuality = body.executionQuality
  }
  if (body.closeReason === 'modified_stop' && body.modifiedStopPrice != null) {
    const stopLine = `סטופ שונה: ${body.modifiedStopPrice}`
    const existingNotes = (trade.notes as string | null) ?? ''
    update.notes = existingNotes ? `${existingNotes}\n${stopLine}` : stopLine
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await admin
    .from('Trade')
    .update(update as any)
    .eq('id', trade.id)
    .eq('userId', user.id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tradeId: trade.id })
}
