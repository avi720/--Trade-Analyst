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
