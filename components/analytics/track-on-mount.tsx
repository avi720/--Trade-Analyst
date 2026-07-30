'use client'

import { useEffect, useRef } from 'react'
import { trackEvent, type FunnelEvent } from '@/lib/analytics/posthog'

/**
 * Fires a funnel event once when mounted. Lets a server component report an outcome it can
 * only detect server-side (a redirect `reason` / `error` query param) without turning the
 * whole page into a client component.
 *
 * The server parent decides *whether* to render this at all, so the event stays accurate:
 * /signup/verified is reached both by a genuine email verification and by a failed PKCE
 * exchange, and only the latter should count.
 */
export function TrackOnMount({
  event,
  properties,
}: {
  event: FunnelEvent
  properties?: Record<string, unknown>
}) {
  // Strict Mode double-invokes effects in dev; without this the event would double-count.
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackEvent(event, properties)
    // Intentionally mount-only: this reports a one-off outcome, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
