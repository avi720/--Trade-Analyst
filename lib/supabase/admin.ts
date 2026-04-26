import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'

/**
 * Admin (service-role) Supabase client. Bypasses RLS.
 * Use only in: seed scripts, integration tests, server-side cron jobs.
 * NEVER import this in any code path that is reachable from a browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env'
    )
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
