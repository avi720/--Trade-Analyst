'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'
import { identifyUser } from '@/lib/analytics/posthog'
import { useConsent } from '@/components/consent/consent-provider'

/**
 * Keeps the PostHog person identity in sync with the Supabase session, on every auth path.
 *
 * Why this exists: identifyUser() used to be called only from the email+password signup
 * wizard, so Google OAuth sign-ins were never identified — their events landed on an
 * anonymous distinct-id that no person lookup could find. That is why the PostHog
 * investigation into swbwywsy@gmail.com (Google signup, 2026-07-15) came back empty: not
 * "never visited", but "never identified".
 *
 * Mounted once in the ROOT layout rather than the dashboard layout — deliberately, because
 * the users we are blind to are exactly the ones who never reach the dashboard.
 *
 * No-ops without analytics consent: identifyUser() itself checks posthog.__loaded, which is
 * only true after ConsentProvider has initialised PostHog on opt-in.
 */
export function AnalyticsIdentity() {
  const { analytics } = useConsent()

  useEffect(() => {
    if (!analytics) return

    let active = true

    // Identify only when the distinct-id has actually drifted from the user id, so repeat
    // renders and token refreshes don't emit redundant $identify events.
    const sync = (userId: string | undefined) => {
      if (!active || !userId) return
      if (!posthog.__loaded) return
      if (posthog.get_distinct_id() === userId) return
      identifyUser(userId)
    }

    const run = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      sync(user?.id)

      // Catches the OAuth return, where the session lands after this effect first ran.
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        sync(session?.user?.id)
      })
      return subscription
    }

    const subscriptionPromise = run()

    return () => {
      active = false
      void subscriptionPromise.then((sub) => sub?.unsubscribe())
    }
  }, [analytics])

  return null
}
