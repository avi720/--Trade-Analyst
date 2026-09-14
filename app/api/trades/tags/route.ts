import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/trades/tags — the caller's distinct tags with usage counts, most
 * used first. Feeds the suggestion dropdown in the entry forms, which do not
 * have the trade list loaded (the search/research tabs derive the same list
 * client-side). RLS scopes the read to the caller.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('Trade')
    .select('tags')
    .eq('userId', user.id)
    .not('tags', 'eq', '{}')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  const tags = Array.from(counts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'he'))

  return NextResponse.json({ tags })
}
