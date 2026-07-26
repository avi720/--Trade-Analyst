import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserRow } from '@/lib/supabase/auth'
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

// Server-only page-level admin gate for RSC admin pages. Redirects to /login
// when unauthenticated and to /research when signed in but not an admin.
// Unlike requireAdmin() (route handlers → 401/403), this throws Next.js'
// redirect signal. Reads the request-cached user + row, so the belt-and-braces
// re-check on every admin sub-page costs no extra round-trip after the admin
// layout's gate already populated the cache.
export async function requireAdminPage(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const row = await getCurrentUserRow()
  if (!row?.isAdmin) redirect('/research')
  return user
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
