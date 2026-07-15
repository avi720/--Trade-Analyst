'use client'

import posthog from 'posthog-js'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
const ENABLED = !!KEY && process.env.NODE_ENV === 'production'

// Session recording is intentionally disabled at launch — financial-data app
// with no masking config yet. See X2 in docs/in-progress/SECURITY-AUDIT-LAUNCH.md;
// re-enable path is X23 (requires maskAllInputs + maskTextFn + sampling: 0.1 +
// opt-out affordance + privacy-page disclosure).
//
// Autocapture is opt-in via [data-analytics] attribute — no click event is sent
// unless the target element (or an ancestor) explicitly declares data-analytics.
// This keeps trackEvent() funnel calls working while preventing accidental
// capture of ticker symbols, dollar amounts, or chat text via automatic click
// tracking.
if (typeof window !== 'undefined' && ENABLED && !posthog.__loaded) {
  posthog.init(KEY!, {
    api_host: HOST,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    person_profiles: 'identified_only',
    autocapture: { css_selector_allowlist: ['[data-analytics]'] },
    disable_session_recording: true,
  })
}

export type FunnelEvent =
  | 'signup_started'
  | 'email_confirmed'
  | 'profile_completed'
  | 'first_trade_imported'
  | 'ai_import_uploaded'
  | 'ai_import_mapped'
  | 'ai_import_confirmed'
  | 'ai_import_failed'

export function trackEvent(event: FunnelEvent, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !ENABLED) return
  posthog.capture(event, properties)
}

export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !ENABLED) return
  posthog.identify(userId, traits)
}

export function resetUser(): void {
  if (typeof window === 'undefined' || !ENABLED) return
  posthog.reset()
}
