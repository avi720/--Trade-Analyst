'use client'

import { useRef, useState } from 'react'
import { TradeEntryForm } from './trade-entry-form'
import { ClosedTradeEntryForm } from './closed-trade-entry-form'
import { TradeExcelImport } from './trade-excel-import'
import { cn } from '@/lib/utils/cn'

type Tab = 'manual' | 'closed' | 'excel'

const TABS: { id: Tab; label: string }[] = [
  { id: 'manual', label: 'טרייד פתוח' },
  { id: 'closed', label: 'טרייד סגור' },
  { id: 'excel', label: 'ייבוא Excel' },
]

export function ManualImportTabs() {
  const [tab, setTab] = useState<Tab>('manual')
  const tablistRef = useRef<HTMLDivElement>(null)

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
    // Move focus to the newly active tab button
    requestAnimationFrame(() => {
      const btn = tablistRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab-id="${TABS[nextIdx].id}"]`
      )
      btn?.focus()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="ייבוא טריידים"
        onKeyDown={handleKeyDown}
        className="flex gap-1 border-b border-border pb-0"
      >
        {TABS.map(t => {
          const isActive = tab === t.id
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
                'px-4 py-2 text-sm font-mono transition-colors border-b-2 -mb-px',
                isActive
                  ? 'border-amber text-amber font-bold'
                  : 'border-transparent text-text-dim hover:text-text-main'
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id="tabpanel-manual" aria-labelledby="tab-manual" hidden={tab !== 'manual'}>
        {tab === 'manual' && <TradeEntryForm />}
      </div>
      <div role="tabpanel" id="tabpanel-closed" aria-labelledby="tab-closed" hidden={tab !== 'closed'}>
        {tab === 'closed' && <ClosedTradeEntryForm />}
      </div>
      <div role="tabpanel" id="tabpanel-excel" aria-labelledby="tab-excel" hidden={tab !== 'excel'}>
        {tab === 'excel' && <TradeExcelImport />}
      </div>
    </div>
  )
}
