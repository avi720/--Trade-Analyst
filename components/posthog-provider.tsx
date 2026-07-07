'use client'

import posthog from 'posthog-js'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
const ENABLED = !!KEY && process.env.NODE_ENV === 'production'

// Keep this init block in sync with lib/analytics/posthog.ts — see the notes
// there. Session recording off (X2); autocapture opt-in via [data-analytics].
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

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return children as React.ReactElement
}
