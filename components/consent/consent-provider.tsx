'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import posthog from 'posthog-js'
import { initPostHog } from '@/lib/analytics/posthog'
import {
  DEFAULT_CONSENT,
  readConsent,
  writeConsent,
  type ConsentState,
} from '@/lib/consent/consent'

interface ConsentContextValue extends ConsentState {
  /** Open the preferences panel (banner expanded / re-opened from footer). */
  managing: boolean
  openPreferences: () => void
  closePreferences: () => void
  /** Persist an explicit choice and apply it to the trackers immediately. */
  setConsent: (next: { analytics: boolean; monitoring: boolean }) => void
}

const ConsentContext = createContext<ConsentContextValue | null>(null)

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext)
  if (!ctx) throw new Error('useConsent must be used within <ConsentProvider>')
  return ctx
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  // Start from DEFAULT (undecided) so SSR and first client render agree; the
  // real cookie is read in the mount effect below to avoid hydration mismatch.
  const [consent, setConsentState] = useState<ConsentState>(DEFAULT_CONSENT)
  const [managing, setManaging] = useState(false)

  useEffect(() => {
    setConsentState(readConsent())
  }, [])

  // Apply analytics consent to PostHog. Runs on mount (after the cookie read
  // lands) and whenever the flag flips. Granting initialises + opts in;
  // revoking opts out and clears any identity/cookies PostHog set.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (consent.analytics) {
      initPostHog()
      if (posthog.__loaded) posthog.opt_in_capturing()
    } else if (posthog.__loaded) {
      posthog.opt_out_capturing()
      posthog.reset()
    }
    // Sentry (monitoring) is gated at load in instrumentation-client.ts; a
    // monitoring change applies on the next page load, so nothing to do here.
  }, [consent.analytics])

  const setConsent = useCallback(
    (next: { analytics: boolean; monitoring: boolean }) => {
      writeConsent(next)
      setConsentState({ decided: true, analytics: next.analytics, monitoring: next.monitoring })
      setManaging(false)
    },
    [],
  )

  const openPreferences = useCallback(() => setManaging(true), [])
  const closePreferences = useCallback(() => setManaging(false), [])

  return (
    <ConsentContext.Provider
      value={{
        ...consent,
        managing,
        openPreferences,
        closePreferences,
        setConsent,
      }}
    >
      {children}
    </ConsentContext.Provider>
  )
}
