import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SOFT_FIELDS = new Set([
  'notes',
  'setupType',
  'emotionalState',
  'executionQuality',
  'stopPrice',
  'targetPrice',
  'didRight',
  'wouldChange',
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Whitelist: only allow soft fields
  const update: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (SOFT_FIELDS.has(key)) {
      update[key] = body[key]
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('Trade')
    .update(update as any)
    .eq('id', params.id)
    .eq('userId', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only manual trades may be deleted — IBKR-synced trades are immutable
  // (the broker connector would re-create them on next sync via brokerExecId dedup).
  const { data: trade, error: fetchError } = await supabase
    .from('Trade')
    .select('id, source')
    .eq('id', params.id)
    .eq('userId', user.id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  if (!trade) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (trade.source !== 'manual') {
    return NextResponse.json({ error: 'Only manual trades can be deleted' }, { status: 403 })
  }

  const { error: ordersError } = await supabase
    .from('Order')
    .delete()
    .eq('tradeId', params.id)
    .eq('userId', user.id)

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 })
  }

  const { error: tradeError } = await supabase
    .from('Trade')
    .delete()
    .eq('id', params.id)
    .eq('userId', user.id)

  if (tradeError) {
    return NextResponse.json({ error: tradeError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
