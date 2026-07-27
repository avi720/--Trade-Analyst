'use client'

import { useState } from 'react'
import { useConsent } from './consent-provider'

interface CookiePreferencesProps {
  /** Called after the user saves, e.g. to collapse the banner. */
  onSaved?: () => void
  /** Compact spacing for the banner; roomier for the settings tab. */
  variant?: 'banner' | 'settings'
}

interface CategoryProps {
  title: string
  description: string
  checked: boolean
  onChange?: (v: boolean) => void
  /** Necessary category — always on, cannot be toggled. */
  locked?: boolean
}

function Category({ title, description, checked, onChange, locked }: CategoryProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-panel-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-main">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-text-dim">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={locked}
        onClick={() => onChange?.(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-amber' : 'bg-shade-2'
        } ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition-all ${
            // RTL: "on" knob sits on the left.
            checked ? 'left-0.5' : 'right-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export function CookiePreferences({ onSaved, variant = 'settings' }: CookiePreferencesProps) {
  const { analytics, monitoring, setConsent } = useConsent()
  const [analyticsOn, setAnalyticsOn] = useState(analytics)
  const [monitoringOn, setMonitoringOn] = useState(monitoring)

  function save(next: { analytics: boolean; monitoring: boolean }) {
    setConsent(next)
    onSaved?.()
  }

  return (
    <div className={variant === 'banner' ? 'space-y-2' : 'space-y-3'}>
      <Category
        title="עוגיות הכרחיות"
        description="נדרשות לתפעול השירות — שמירת סשן ההתחברות, אבטחה, והעדפות התצוגה שלך. תמיד פעילות."
        checked
        locked
      />
      <Category
        title="אנליטיקה"
        description="עוזרות לנו להבין איך משתמשים באתר כדי לשפר אותו. אנונימי — ללא נתוני המסחר שלך."
        checked={analyticsOn}
        onChange={setAnalyticsOn}
      />
      <Category
        title="ניטור שגיאות"
        description="הפעל על מנת שנוכל לקבל דיווחים מלאים על תקלות טכניות כדי שנוכל לתקן אותן. כולל תיעוד מסך רק במקרה של שגיאה, עם הסתרת כל הטקסט והשדות."
        checked={monitoringOn}
        onChange={setMonitoringOn}
      />

      <p className="pt-1 text-xs text-text-dim">
        שינוי הסכמת ניטור השגיאות ייכנס לתוקף בטעינת העמוד הבאה.
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => save({ analytics: analyticsOn, monitoring: monitoringOn })}
          className="rounded-md bg-amber px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-dark"
        >
          שמור העדפות
        </button>
        <button
          type="button"
          onClick={() => {
            setAnalyticsOn(true)
            setMonitoringOn(true)
            save({ analytics: true, monitoring: true })
          }}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-main transition-colors hover:bg-panel-3"
        >
          אשר הכל
        </button>
      </div>
    </div>
  )
}
