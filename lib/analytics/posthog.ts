'use client'

import posthog from 'posthog-js'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
const ENABLED = !!KEY && process.env.NODE_ENV === 'production'

/**
 * Initialise PostHog. Called ONLY after the user has granted analytics consent
 * (see components/consent/consent-provider.tsx) — never at module load, so no
 * PostHog cookie or network request happens before opt-in. Idempotent: the
 * `__loaded` guard makes repeat calls (e.g. re-render, consent re-grant) safe.
 *
 * Session recording is intentionally disabled at launch — financial-data app
 * with no masking config yet. See X2 in docs/in-progress/SECURITY-AUDIT-LAUNCH.md;
 * re-enable path is X23 (requires maskAllInputs + maskTextFn + sampling: 0.1 +
 * opt-out affordance + privacy-page disclosure).
 *
 * Autocapture is opt-in via [data-analytics] attribute — no click event is sent
 * unless the target element (or an ancestor) explicitly declares data-analytics.
 * This keeps trackEvent() funnel calls working while preventing accidental
 * capture of ticker symbols, dollar amounts, or chat text via automatic click
 * tracking.
 */
export function initPostHog(): void {
  if (typeof window === 'undefined' || !ENABLED || posthog.__loaded) return
  posthog.init(KEY!, {
    api_host: HOST,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    person_profiles: 'identified_only',
    autocapture: { css_selector_allowlist: ['[data-analytics]'] },
    disable_session_recording: true,
    // Pin the two useful, non-PII product signals ON explicitly so they don't
    // depend on the remote project config staying enabled:
    //   - web_vitals: Core Web Vitals ($web_vitals events) for perf monitoring.
    //   - dead clicks: clicks that produce no page change (frustration signal).
    // Surveys are turned OFF — we don't run in-app surveys, so there's no reason
    // to ship surveys.js to every consenting visitor.
    capture_performance: { web_vitals: true },
    capture_dead_clicks: true,
    disable_surveys: true,
  })
}

export type FunnelEvent =
  | 'signup_started'
  | 'email_confirmed'
  | 'profile_completed'
  | 'first_trade_imported'
  // Google OAuth + auth-failure telemetry. Before these existed, a Google signup that lost
  // its PKCE exchange left no trace anywhere — see docs/in-progress/AUTH-HARDENING-GEO-GATE.md.
  | 'google_signin_clicked'
  | 'oauth_callback_failed'
  | 'login_failed'
  | 'ai_import_uploaded'
  | 'ai_import_mapped'
  | 'ai_import_confirmed'
  | 'ai_import_failed'

export function trackEvent(event: FunnelEvent, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !ENABLED || !posthog.__loaded) return
  posthog.capture(event, properties)
}

export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !ENABLED || !posthog.__loaded) return
  posthog.identify(userId, traits)
}

export function resetUser(): void {
  if (typeof window === 'undefined' || !ENABLED || !posthog.__loaded) return
  posthog.reset()
}
