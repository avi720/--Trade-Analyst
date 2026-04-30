'use client'

import { useState } from 'react'
import { TradeEntryForm } from './trade-entry-form'
import { TradeExcelImport } from './trade-excel-import'
import { cn } from '@/lib/utils/cn'

type Tab = 'manual' | 'excel'

export function ManualImportTabs() {
  const [tab, setTab] = useState<Tab>('manual')

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-[#222222] pb-0">
        {([
          { id: 'manual' as Tab, label: 'הזנה ידנית' },
          { id: 'excel' as Tab, label: 'ייבוא Excel' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-mono transition-colors border-b-2 -mb-px',
              tab === t.id
                ? 'border-[#FFB800] text-[#FFB800]'
                : 'border-transparent text-[#888888] hover:text-[#E0E0E0]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'manual' ? <TradeEntryForm /> : <TradeExcelImport />}
    </div>
  )
}
