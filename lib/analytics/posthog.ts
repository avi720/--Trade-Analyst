'use client'

import posthog from 'posthog-js'

let initialized = false

export function initPostHog(): void {
  if (initialized) return
  if (typeof window === 'undefined') return

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

  if (!key || process.env.NODE_ENV !== 'production') return

  posthog.init(key, {
    api_host: host,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    person_profiles: 'identified_only',
    autocapture: true,
    disable_session_recording: false,
  })

  initialized = true
}

export type FunnelEvent =
  | 'signup_started'
  | 'email_confirmed'
  | 'profile_completed'
  | 'first_trade_imported'

export function trackEvent(event: FunnelEvent, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (!initialized) return
  posthog.capture(event, properties)
}

export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (!initialized) return
  posthog.identify(userId, traits)
}

export function resetUser(): void {
  if (typeof window === 'undefined') return
  if (!initialized) return
  posthog.reset()
}
