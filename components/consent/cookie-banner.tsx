'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useConsent } from './consent-provider'
import { CookiePreferences } from './cookie-preferences'

export function CookieBanner() {
  const { decided, managing, setConsent, closePreferences } = useConsent()
  const [expanded, setExpanded] = useState(false)

  // Show on first visit (undecided), or when re-opened from the footer link
  // (managing) even after a prior choice.
  const visible = !decided || managing
  if (!visible) return null

  // Re-opened from the footer → go straight to the preferences panel.
  const showPreferences = expanded || (managing && decided)

  function dismissManaging() {
    setExpanded(false)
    closePreferences()
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="הסכמת עוגיות"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-panel-2/95 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-4xl px-5 py-5">
        {showPreferences ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-base font-semibold text-text-main">התאמת העדפות עוגיות</h2>
              {managing && decided && (
                <button
                  type="button"
                  onClick={dismissManaging}
                  className="text-sm text-text-dim transition-colors hover:text-text-main"
                >
                  סגור
                </button>
              )}
            </div>
            <CookiePreferences variant="banner" onSaved={dismissManaging} />
          </div>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm leading-relaxed text-text-main/90">
              <p>
                אנחנו משתמשים בעוגיות הכרחיות לתפעול השירות, ובעוגיות אופציונליות
                לאנליטיקה ולניטור שגיאות — רק בהסכמתך.{' '}
                <Link href="/privacy" className="text-amber hover:underline">
                  מדיניות הפרטיות
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:shrink-0">
              <button
                type="button"
                onClick={() => setConsent({ analytics: true, monitoring: true })}
                className="rounded-md bg-amber px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-dark"
              >
                אשר הכל
              </button>
              <button
                type="button"
                onClick={() => setConsent({ analytics: false, monitoring: false })}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-main transition-colors hover:bg-panel-3"
              >
                דחה מיותרות
              </button>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-md px-4 py-2 text-sm font-medium text-text-dim transition-colors hover:text-text-main"
              >
                ניהול העדפות
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
