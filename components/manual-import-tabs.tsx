'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { TradeEntryForm } from './trade-entry-form'
import { ClosedTradeEntryForm } from './closed-trade-entry-form'
import { TradeExcelImport } from './trade-excel-import'
import { LockedFeatureOverlay } from './billing/locked-feature-overlay'
import { cn } from '@/lib/utils/cn'
import type { SubscriptionTier } from '@/lib/billing/tier'

type Tab = 'manual' | 'closed' | 'excel'

const TABS: { id: Tab; label: string }[] = [
  { id: 'manual', label: 'טרייד פתוח' },
  { id: 'closed', label: 'טרייד סגור' },
  { id: 'excel', label: 'ייבוא Excel' },
]

interface ManualImportTabsProps {
  userTier: SubscriptionTier
  tradeCount: number
  tradeLimit: number
}

export function ManualImportTabs({ userTier, tradeCount, tradeLimit }: ManualImportTabsProps) {
  const [tab, setTab] = useState<Tab>('manual')
  const tablistRef = useRef<HTMLDivElement>(null)

  const isFree = userTier === 'Free'
  const limitReached = isFree && tradeCount >= tradeLimit

  function handleKeyDown(e: React.KeyboardEvent) {
    const idx = TABS.findIndex(t => t.id === tab)
    if (idx < 0) return
    let nextIdx = idx
    // RTL: ArrowLeft advances to next, ArrowRight goes back.
    if (e.key === 'ArrowLeft') nextIdx = (idx + 1) % TABS.length
    else if (e.key === 'ArrowRight') nextIdx = (idx - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = TABS.length - 1
    else return
    e.preventDefault()
    setTab(TABS[nextIdx].id)
    requestAnimationFrame(() => {
      const btn = tablistRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab-id="${TABS[nextIdx].id}"]`
      )
      btn?.focus()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {isFree && <FreeTierUsageBar tradeCount={tradeCount} tradeLimit={tradeLimit} />}

      <div
        ref={tablistRef}
        role="tablist"
        aria-label="ייבוא טריידים"
        onKeyDown={handleKeyDown}
        className="flex gap-1 border-b border-border pb-0"
      >
        {TABS.map(t => {
          const isActive = tab === t.id
          const showProDot = isFree && t.id === 'excel'
          return (
            <button
              key={t.id}
              data-tab-id={t.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${t.id}`}
              id={`tab-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-mono transition-colors border-b-2 -mb-px',
                isActive
                  ? 'border-amber text-amber font-bold'
                  : 'border-transparent text-text-dim hover:text-text-main'
              )}
            >
              {t.label}
              {showProDot && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full bg-amber/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber"
                  aria-label="Pro בלבד"
                >
                  <Sparkles size={10} strokeWidth={2.5} aria-hidden="true" />
                  Pro
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id="tabpanel-manual" aria-labelledby="tab-manual" hidden={tab !== 'manual'}>
        {tab === 'manual' && (limitReached ? (
          <LockedFeatureOverlay
            title="הגעת למגבלת המסלול החינמי"
            description={`המסלול החינמי כולל עד ${tradeLimit} טריידים בהזנה ידנית. שדרג ל-Pro כדי להמשיך להוסיף טריידים ללא הגבלה, לייבא Excel ולסנכרן מ-IBKR אוטומטית.`}
          >
            <TradeEntryForm />
          </LockedFeatureOverlay>
        ) : (
          <TradeEntryForm />
        ))}
      </div>
      <div role="tabpanel" id="tabpanel-closed" aria-labelledby="tab-closed" hidden={tab !== 'closed'}>
        {tab === 'closed' && (limitReached ? (
          <LockedFeatureOverlay
            title="הגעת למגבלת המסלול החינמי"
            description={`המסלול החינמי כולל עד ${tradeLimit} טריידים בהזנה ידנית. שדרג ל-Pro כדי להמשיך להוסיף טריידים ללא הגבלה, לייבא Excel ולסנכרן מ-IBKR אוטומטית.`}
          >
            <ClosedTradeEntryForm />
          </LockedFeatureOverlay>
        ) : (
          <ClosedTradeEntryForm />
        ))}
      </div>
      <div role="tabpanel" id="tabpanel-excel" aria-labelledby="tab-excel" hidden={tab !== 'excel'}>
        {tab === 'excel' && (isFree ? (
          <LockedFeatureOverlay
            title="ייבוא Excel של עסקאות"
            description="העלאת קובץ Excel עם מספר טריידים בבת אחת זמינה במסלול Pro. שדרג כדי לחסוך זמן על ייבוא ידני של כל עסקה בנפרד."
          >
            <TradeExcelImport />
          </LockedFeatureOverlay>
        ) : (
          <TradeExcelImport />
        ))}
      </div>
    </div>
  )
}

function FreeTierUsageBar({ tradeCount, tradeLimit }: { tradeCount: number; tradeLimit: number }) {
  const remaining = Math.max(0, tradeLimit - tradeCount)
  const reached = remaining === 0
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm',
        reached
          ? 'border-red/30 bg-red/5 text-red'
          : 'border-amber/30 bg-amber-tint text-text-main'
      )}
      role="status"
    >
      <span className="font-mono">
        מסלול חינמי · {tradeCount}/{tradeLimit} טריידים
        {!reached && <span className="text-text-dim"> · נותרו {remaining}</span>}
      </span>
      <Link
        href="/profile?tab=billing"
        className="text-xs font-medium text-amber hover:underline"
      >
        שדרג ל-Pro ←
      </Link>
    </div>
  )
}
