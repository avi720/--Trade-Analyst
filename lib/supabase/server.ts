import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/db/types'

export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies()

  // Cast: @supabase/ssr 0.6.x's createServerClient<Database> generic does not
  // propagate cleanly to from()/upsert() callsites. The runtime client is
  // identical to a SupabaseClient<Database>, so we re-assert the type here.
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookie setting ignored
          }
        },
      },
    }
  ) as unknown as SupabaseClient<Database>
}
