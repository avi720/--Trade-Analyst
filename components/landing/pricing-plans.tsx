'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Zap } from 'lucide-react'
import {
  PRICE_MONTHLY_USD,
  PRICE_ANNUAL_USD,
  PROMO_MONTHLY_USD,
  PROMO_ANNUAL_USD,
} from '@/lib/billing/prices'

type Billing = 'monthly' | 'annual'

/**
 * The reusable pricing unit: the monthly/annual toggle + the Free and Pro
 * cards. Rendered inside the landing-page `PricingSection` (with a section
 * heading) and standalone on `/pricing` (with a page-level intro). Kept free of
 * any section chrome so both callers own their own surrounding heading — no
 * duplicate h2/h1 and no copy drift between the two placements.
 */
export function PricingPlans() {
  const [billing, setBilling] = useState<Billing>('monthly')
  const isAnnual = billing === 'annual'

  return (
    <>
      <BillingToggle value={billing} onChange={setBilling} />

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <PricingCard
          name="Free"
          price="$0"
          priceSuffix="לתמיד"
          cta="התחל עכשיו"
          features={[
            'הזנה ידנית — עד 30 טריידים',
            'לוח research מלא',
            'חיפוש וסינון מתקדם',
            '3 הודעות לחנן ביום (מצב בסיסי)',
          ]}
        />
        <PricingCard
          name="Pro"
          price={isAnnual ? `$${PRICE_ANNUAL_USD}` : `$${PRICE_MONTHLY_USD}`}
          priceSuffix={isAnnual ? 'לשנה' : 'לחודש'}
          cta="14 ימי ניסיון חינם"
          highlighted
          launchPrice={isAnnual ? `$${PROMO_ANNUAL_USD}` : `$${PROMO_MONTHLY_USD}`}
          launchNote={isAnnual ? 'לשנה הראשונה' : 'ל-3 חודשים ראשונים'}
          features={[
            'כל מה שב-Free',
            'הזנה ידנית — ללא הגבלה',
            'ייבוא Excel של עסקאות',
            'סנכרון אוטומטי מ-Interactive Brokers',
            'חנן ללא הגבלה + מצב Pro מעמיק',
            'ייצוא CSV מלא',
          ]}
        />
      </div>
    </>
  )
}

function BillingToggle({
  value,
  onChange,
}: {
  value: Billing
  onChange: (v: Billing) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="בחירת מחזור חיוב"
      className="mx-auto flex w-fit items-center gap-1 rounded-full border border-border bg-bg-dark/60 p-1"
    >
      <ToggleButton
        active={value === 'monthly'}
        onClick={() => onChange('monthly')}
      >
        חודשי
      </ToggleButton>
      <ToggleButton
        active={value === 'annual'}
        onClick={() => onChange('annual')}
      >
        <span className="flex items-center gap-2">
          שנתי
          <span
            className={
              'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
              (value === 'annual'
                ? 'bg-bg-dark text-green'
                : 'bg-green/15 text-green')
            }
          >
            חסוך 17%
          </span>
        </span>
      </ToggleButton>
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'rounded-full px-5 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'bg-amber text-bg-dark'
          : 'text-text-dim hover:text-text-main')
      }
    >
      {children}
    </button>
  )
}

function PricingCard({
  name,
  price,
  priceSuffix,
  cta,
  features,
  highlighted,
  launchPrice,
  launchNote,
}: {
  name: string
  price: string
  priceSuffix: string
  cta: string
  features: string[]
  highlighted?: boolean
  launchPrice?: string
  launchNote?: string
}) {
  return (
    <div
      className={
        'relative flex h-full flex-col rounded-xl p-8 ' +
        (highlighted
          ? 'border-2 border-amber bg-panel-bg shadow-[0_0_40px_-12px_rgba(255,184,0,0.35)]'
          : 'border border-border bg-panel-bg')
      }
    >
      {highlighted && (
        <span className="absolute -top-3 right-6 rounded-full bg-amber px-3 py-1 text-xs font-semibold text-bg-dark">
          מומלץ
        </span>
      )}

      <h3 className="text-xl font-semibold text-text-main">{name}</h3>

      {launchPrice ? (
        <div className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg text-text-mute line-through">{price}</span>
            <span className="font-mono text-4xl font-bold text-green">{launchPrice}</span>
            <span className="text-sm text-text-dim">/ {priceSuffix}</span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green">
            <Zap className="h-3.5 w-3.5" />
            מבצע השקה — {launchNote}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-mono text-4xl font-bold text-text-main">{price}</span>
          <span className="text-sm text-text-dim">/ {priceSuffix}</span>
        </div>
      )}

      <ul className="mt-8 flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-text-main/90">
            <Check
              className={
                'mt-0.5 h-4 w-4 flex-shrink-0 ' +
                (highlighted ? 'text-amber' : 'text-green')
              }
              strokeWidth={2.5}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/signup"
        className={
          'mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ' +
          (highlighted
            ? 'border-transparent bg-amber text-bg-dark hover:bg-amber/90'
            : 'border-border bg-bg-dark text-text-main hover:border-amber hover:text-amber')
        }
      >
        {cta}
      </Link>
    </div>
  )
}
