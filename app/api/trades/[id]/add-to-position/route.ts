import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyPositionChange } from '@/lib/trade/apply-position-change'
import type { PositionChangePayload } from '@/lib/trade/validate-position-change'

/**
 * Adds money to an open manual position (FIFO SCALE_IN) and appends the fixed
 * "בתאריך … הוספתי כסף לפוזיציה כי …" note.
 *
 * This is the sanctioned path for growing a position — the manual-entry tab
 * rejects legs that touch an existing trade and points here.
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

  const result = await applyPositionChange(id, user.id, 'add', body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    tradeId: result.tradeId,
    noteAdded: result.noteAdded,
  })
}
