import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyPositionChange } from '@/lib/trade/apply-position-change'
import type { PositionChangePayload } from '@/lib/trade/validate-position-change'

/**
 * Sells part of an open manual position (FIFO REDUCE) and appends the fixed
 * "בתאריך … מכרתי חלק מהפוזיציה כי …" note.
 *
 * Strictly partial: selling the whole open quantity is a close and must go
 * through POST /api/trades/[id]/close, which collects closeReason,
 * executionQuality and wouldChange. Enforced in validateReduceAgainstTrade.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: PositionChangePayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = await applyPositionChange(id, user.id, 'reduce', body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    tradeId: result.tradeId,
    noteAdded: result.noteAdded,
  })
}
