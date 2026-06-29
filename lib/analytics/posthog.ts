'use client'

import posthog from 'posthog-js'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
const ENABLED = !!KEY && process.env.NODE_ENV === 'production'

if (typeof window !== 'undefined' && ENABLED && !posthog.__loaded) {
  posthog.init(KEY!, {
    api_host: HOST,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    person_profiles: 'identified_only',
    autocapture: true,
    disable_session_recording: false,
  })
}

export type FunnelEvent =
  | 'signup_started'
  | 'email_confirmed'
  | 'profile_completed'
  | 'first_trade_imported'

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
