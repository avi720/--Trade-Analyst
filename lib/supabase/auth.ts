import 'server-only'
import { cache } from 'react'
import { createClient } from './server'

/**
 * Request-deduped `auth.getUser()`.
 *
 * `supabase.auth.getUser()` is a network round-trip to the Supabase Auth server
 * on every call. In the App Router a single navigation renders the (dashboard)
 * layout, optionally a nested layout (e.g. admin), and the leaf page — each of
 * which independently needs the authenticated user. Wrapping the call in React
 * `cache()` collapses those N identical round-trips into ONE per server request.
 *
 * Server-only: never import from a `"use client"` module. Use the browser
 * client (`lib/supabase/client.ts`) on the client side.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * Request-deduped read of the current user's `User` row — the columns the
 * dashboard chrome and the admin gate need (`firstName` for the signup-funnel
 * guard, `isAdmin` for the admin gate, `subscriptionTier` for Pro-gating).
 *
 * Returns `null` when unauthenticated, or when the row does not exist yet (a
 * fresh sign-in, before `(dashboard)/layout.tsx` inserts it). Shares the single
 * `getCurrentUser()` round-trip above, and — because it is itself `cache()`d —
 * the layout chain (dashboard → admin → page) reads the row once, not 3×.
 */
export const getCurrentUserRow = cache(async () => {
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('User')
    .select('firstName, isAdmin, subscriptionTier')
    .eq('id', user.id)
    .maybeSingle()
  return data
})
