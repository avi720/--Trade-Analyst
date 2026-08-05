import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OPEN_TRADE_COLUMNS, type OpenTradeRow } from '@/lib/trade/guard-position-mutations'

/**
 * The caller's currently-open positions, in the exact shape the FIFO guard
 * needs to build an OpenTradeSnapshot. Powers the manual entry form's
 * client-side "this tab opens positions only" check, so the user sees the
 * conflict while typing instead of after submitting.
 *
 * RLS-bound client — a user can only ever read their own rows.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('Trade')
    .select(OPEN_TRADE_COLUMNS)
    .eq('userId', user.id)
    .eq('status', 'Open')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ trades: (data ?? []) as OpenTradeRow[] })
}
