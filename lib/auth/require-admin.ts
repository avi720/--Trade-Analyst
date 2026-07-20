import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'

export class AdminAuthError extends Error {
  status: 401 | 403
  constructor(status: 401 | 403, message: string) {
    super(message)
    this.status = status
    this.name = 'AdminAuthError'
  }
}

// Server-only. Verifies the caller is signed in AND has User.isAdmin=true.
// Throws AdminAuthError on failure — route handlers should catch and map
// to NextResponse via adminAuthErrorResponse().
export async function requireAdmin(): Promise<{
  user: User
  supabase: SupabaseClient<Database>
}> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new AdminAuthError(401, 'Unauthorized')
  }

  const { data: row } = await supabase
    .from('User')
    .select('isAdmin')
    .eq('id', user.id)
    .maybeSingle()

  if (!row?.isAdmin) {
    throw new AdminAuthError(403, 'Forbidden')
  }

  return { user, supabase }
}

export function adminAuthErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof AdminAuthError) {
    return NextResponse.json(
      { error: err.message },
      { status: err.status },
    )
  }
  return null
}
