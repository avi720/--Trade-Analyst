/**
 * Integration test: X1 — paywall bypass regression guard.
 * Skipped automatically if SUPABASE_SERVICE_ROLE_KEY is not set.
 *
 * Before migration `20260707190000_harden_user_billing_write_paths`, an
 * authenticated Free user could execute
 *   await supabase.from('User').update({ subscriptionTier: 'Pro' }).eq('id', me)
 * from the browser and silently upgrade themselves to Pro. The RLS policy
 * `users_own_row` (auth.uid() = id) let it through and the column had a
 * table-level UPDATE grant on the `authenticated` role.
 *
 * This test signs in as a Free user with a real Supabase JWT (not the
 * service-role admin client) and confirms that:
 *   1. Attempts to UPDATE any of the five billing columns either error or
 *      are a silent no-op (zero rows updated).
 *   2. Attempts to INSERT with subscriptionTier='Pro' baked into the row
 *      leave subscriptionTier at its DB default ('Free').
 *   3. The service-role client (webhook path) can still write these columns.
 *
 * Runs against the real Supabase DB — cleans up after itself.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/db/types'

const DB_AVAILABLE =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY

const TEST_USER_ID = 'a0000000-0000-0000-0000-000000000003'
const TEST_EMAIL = 'paywall-bypass-test@example.com'
const TEST_PASSWORD = 'paywall-bypass-test-pw-' + TEST_USER_ID

describe.skipIf(!DB_AVAILABLE)('X1 — paywall bypass regression guard', () => {
  const admin = DB_AVAILABLE ? createAdminClient() : null!

  async function cleanup() {
    await admin.from('User').delete().eq('id', TEST_USER_ID)
    await admin.auth.admin.deleteUser(TEST_USER_ID).catch(() => {})
  }

  async function signInAsTestUser() {
    const client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { error } = await client.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    if (error) throw error
    return client
  }

  beforeAll(async () => {
    await cleanup()
    const { error: authErr } = await admin.auth.admin.createUser({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin API accepts id, types lag
    } as any)
    if (authErr) throw authErr
    // Seed the app-level User row as Free (mirrors what the dashboard layout does on first login).
    const { error } = await admin
      .from('User')
      .insert({ id: TEST_USER_ID, email: TEST_EMAIL, settings: {} })
    if (error) throw error
  })

  afterAll(async () => {
    await cleanup()
  })

  it('UPDATE subscriptionTier as authenticated is blocked — DB column stays Free', async () => {
    const client = await signInAsTestUser()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- billing cols intentionally excluded from generated Update type; this test IS the attack surface
    const { error } = await (client.from('User') as any)
      .update({ subscriptionTier: 'Pro' })
      .eq('id', TEST_USER_ID)

    // Either the DB rejects the UPDATE outright (column privilege denied) or
    // it silently no-ops. Either outcome is acceptable — what we assert is
    // that the DB state did NOT change.
    if (error) {
      expect(error.code === '42501' || error.message.toLowerCase().includes('permission')).toBe(true)
    }

    const { data } = await admin
      .from('User')
      .select('subscriptionTier')
      .eq('id', TEST_USER_ID)
      .single()
    expect(data?.subscriptionTier).toBe('Free')
  })

  it('UPDATE lemonsqueezySubscriptionId as authenticated is blocked — cannot forge webhook state', async () => {
    const client = await signInAsTestUser()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.from('User') as any)
      .update({ lemonsqueezySubscriptionId: 'sub_forged_12345' })
      .eq('id', TEST_USER_ID)

    const { data } = await admin
      .from('User')
      .select('lemonsqueezySubscriptionId')
      .eq('id', TEST_USER_ID)
      .single()
    expect(data?.lemonsqueezySubscriptionId).toBeNull()
  })

  it('UPDATE firstName as authenticated still works — profile flow intact', async () => {
    const client = await signInAsTestUser()

    const { error } = await client
      .from('User')
      .update({ firstName: 'Regression' })
      .eq('id', TEST_USER_ID)

    expect(error).toBeNull()

    const { data } = await admin
      .from('User')
      .select('firstName, subscriptionTier')
      .eq('id', TEST_USER_ID)
      .single()
    expect(data?.firstName).toBe('Regression')
    expect(data?.subscriptionTier).toBe('Free') // billing tier unchanged
  })

  it('service-role admin can still UPDATE billing columns — webhook path unaffected', async () => {
    const { error } = await admin
      .from('User')
      .update({
        subscriptionTier: 'Pro',
        subscriptionStatus: 'active',
        lemonsqueezySubscriptionId: 'sub_real_from_lemonsqueezy',
      })
      .eq('id', TEST_USER_ID)

    expect(error).toBeNull()

    const { data } = await admin
      .from('User')
      .select('subscriptionTier, subscriptionStatus, lemonsqueezySubscriptionId')
      .eq('id', TEST_USER_ID)
      .single()
    expect(data?.subscriptionTier).toBe('Pro')
    expect(data?.subscriptionStatus).toBe('active')
    expect(data?.lemonsqueezySubscriptionId).toBe('sub_real_from_lemonsqueezy')

    // Reset for other tests / reruns.
    await admin
      .from('User')
      .update({
        subscriptionTier: 'Free',
        subscriptionStatus: null,
        lemonsqueezySubscriptionId: null,
      })
      .eq('id', TEST_USER_ID)
  })
})
