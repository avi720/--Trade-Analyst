/**
 * Research dashboard — filter bar.
 *
 * Pure controlled component. Owns no state — all filter values + setters come
 * from the parent. Side-effects (localStorage for holdUnit) live in the parent.
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import type { HoldUnit } from './lib'

export interface FilterState {
  dateFrom: string
  dateTo: string
  tickerFilter: string
  setupFilter: string
  directionFilter: string
  resultFilter: string
  execQualMin: string
  execQualMax: string
  holdHoursMin: string
  holdHoursMax: string
  holdUnit: HoldUnit
  rMin: string
  rMax: string
}

export interface FilterBarProps extends FilterState {
  setupTypes: string[]
  tickers: string[]
  hasActiveFilter: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  onDateFromChange: (v: string) => void
  onDateToChange: (v: string) => void
  onTickerChange: (v: string) => void
  onSetupChange: (v: string) => void
  onDirectionChange: (v: string) => void
  onResultChange: (v: string) => void
  onExecQualMinChange: (v: string) => void
  onExecQualMaxChange: (v: string) => void
  onHoldMinChange: (v: string) => void
  onHoldMaxChange: (v: string) => void
  onHoldUnitChange: (v: HoldUnit) => void
  onRMinChange: (v: string) => void
  onRMaxChange: (v: string) => void
  onReset: () => void
}

export function FilterBar(p: FilterBarProps) {
  return (
    <div className="panel p-4 mb-6">
      <div className={'flex items-center justify-between' + (p.collapsed ? '' : ' mb-3')}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={p.onToggleCollapsed}
            aria-expanded={!p.collapsed}
            aria-label={p.collapsed ? 'הצג סינון' : 'הסתר סינון'}
            className="text-text-dim hover:text-text-main transition-colors font-mono text-xs px-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
          >
            <span aria-hidden="true">{p.collapsed ? '▼' : '▲'}</span>
          </button>
          <h2 className="text-text-main text-sm font-sans font-semibold">סינון</h2>
        </div>
        {p.hasActiveFilter && (
          <button onClick={p.onReset}
            className="btn-ghost px-3 py-1.5 text-sm font-sans border border-shade rounded text-text-dim">
            נקה פילטרים
          </button>
        )}
      </div>
      {!p.collapsed && (
      <div className="flex flex-wrap gap-3 items-end">

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-date-from" className="text-text-dim text-sm font-sans">מתאריך</label>
          <div className="relative">
            <input id="filter-date-from" type="date" lang="en-GB"
              data-empty={!p.dateFrom}
              value={p.dateFrom} onChange={e => p.onDateFromChange(e.target.value)}
              className="input-base date-uppercase text-sm font-mono w-36" dir="ltr" />
            {!p.dateFrom && (
              <span aria-hidden="true"
                className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none text-sm font-mono text-text-dim tracking-tight">
                DD / MM / YYYY
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-date-to" className="text-text-dim text-sm font-sans">עד תאריך</label>
          <div className="relative">
            <input id="filter-date-to" type="date" lang="en-GB"
              data-empty={!p.dateTo}
              value={p.dateTo} onChange={e => p.onDateToChange(e.target.value)}
              className="input-base date-uppercase text-sm font-mono w-36" dir="ltr" />
            {!p.dateTo && (
              <span aria-hidden="true"
                className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none text-sm font-mono text-text-dim tracking-tight">
                DD / MM / YYYY
              </span>
            )}
          </div>
        </div>

        <TickerCombobox value={p.tickerFilter} onChange={p.onTickerChange} tickers={p.tickers} />

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-setup" className="text-text-dim text-sm font-sans">סטאפ</label>
          <select id="filter-setup" value={p.setupFilter} onChange={e => p.onSetupChange(e.target.value)}
            className="input-base text-sm font-sans">
            <option value="all">הכל</option>
            {p.setupTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-direction" className="text-text-dim text-sm font-sans">כיוון</label>
          <select id="filter-direction" value={p.directionFilter} onChange={e => p.onDirectionChange(e.target.value)}
            className="input-base text-sm font-sans">
            <option value="all">הכל</option>
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-result" className="text-text-dim text-sm font-sans">תוצאה</label>
          <select id="filter-result" value={p.resultFilter} onChange={e => p.onResultChange(e.target.value)}
            className="input-base text-sm font-sans">
            <option value="all">הכל</option>
            <option value="Win">Win</option>
            <option value="Loss">Loss</option>
            <option value="Breakeven">Breakeven</option>
          </select>
        </div>

        <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-execqual-label">
          <span id="filter-execqual-label" className="text-text-dim text-sm font-sans">איכות ביצוע (1-10)</span>
          <div className="flex gap-1 items-center">
            <input type="number" aria-label="איכות ביצוע מינימלית" placeholder="1" min={1} max={10} value={p.execQualMin}
              onChange={e => p.onExecQualMinChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
            <span className="text-text-dim text-sm" aria-hidden="true">–</span>
            <input type="number" aria-label="איכות ביצוע מקסימלית" placeholder="10" min={1} max={10} value={p.execQualMax}
              onChange={e => p.onExecQualMaxChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
          </div>
          <span className="text-text-mute text-[11px] font-sans">כולל ערך זה</span>
        </div>

        <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-hold-label">
          <span id="filter-hold-label" className="text-text-dim text-sm font-sans">
            זמן החזקה ({p.holdUnit === 'days' ? 'ימים' : 'שעות'})
          </span>
          <div className="flex gap-1 items-center">
            <input type="number" aria-label={`זמן החזקה מינימלי ב${p.holdUnit === 'days' ? 'ימים' : 'שעות'}`}
              placeholder="1" min={0} value={p.holdHoursMin}
              onChange={e => p.onHoldMinChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
            <span className="text-text-dim text-sm" aria-hidden="true">–</span>
            <input type="number" aria-label={`זמן החזקה מקסימלי ב${p.holdUnit === 'days' ? 'ימים' : 'שעות'}`}
              placeholder="24" min={0} value={p.holdHoursMax}
              onChange={e => p.onHoldMaxChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
            <select value={p.holdUnit} onChange={e => p.onHoldUnitChange(e.target.value as HoldUnit)}
              aria-label="יחידת מדידה לזמן ההחזקה"
              className="input-base text-xs font-sans px-1">
              <option value="hours">שעות</option>
              <option value="days">ימים</option>
            </select>
          </div>
          <span className="text-text-mute text-[11px] font-sans">כולל ערך זה</span>
        </div>

        <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-r-label">
          <span id="filter-r-label" className="text-text-dim text-sm font-sans">סינון לפי R</span>
          <div className="flex gap-2 items-center">
            <span className="text-text-dim text-sm font-sans">מ:</span>
            <input type="number" step="0.1" aria-label="R מינימלי" placeholder="-1.0" value={p.rMin}
              onChange={e => p.onRMinChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
            <span className="text-text-dim text-sm font-sans">עד:</span>
            <input type="number" step="0.1" aria-label="R מקסימלי" placeholder="5.0" value={p.rMax}
              onChange={e => p.onRMaxChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
          </div>
          <span className="text-text-mute text-[11px] font-sans">כולל ערך זה</span>
        </div>

      </div>
      )}
    </div>
  )
}

// ─── TickerCombobox ──────────────────────────────────────────────────────────
// Hand-rolled combobox for the ticker filter. <datalist> renders LTR-broken
// in RTL pages and on Edge with no styling control, so this is a small
// controlled dropdown over the user's own ticker set.

function TickerCombobox({
  value, onChange, tickers,
}: { value: string; onChange: (v: string) => void; tickers: string[] }) {
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const suggestions = value.trim() === ''
    ? tickers.slice(0, 8)
    : tickers.filter(t => t.toUpperCase().startsWith(value.trim().toUpperCase())).slice(0, 8)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => { setHighlightIdx(0) }, [value])

  function commit(ticker: string) {
    onChange(ticker)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open && suggestions[highlightIdx]) {
      e.preventDefault()
      commit(suggestions[highlightIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="flex flex-col gap-1 relative">
      <label htmlFor="filter-ticker" className="text-text-dim text-sm font-sans">טיקר</label>
      <input
        id="filter-ticker"
        type="text"
        placeholder="AAPL..."
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="filter-ticker-listbox"
        role="combobox"
        className="input-base text-sm font-mono w-24"
        dir="ltr"
      />
      {open && suggestions.length > 0 && (
        <ul
          id="filter-ticker-listbox"
          role="listbox"
          dir="ltr"
          className="absolute top-full mt-1 z-30 w-24 max-h-60 overflow-auto rounded border border-border bg-panel shadow-lg py-1"
        >
          {suggestions.map((t, i) => (
            <li
              key={t}
              role="option"
              aria-selected={i === highlightIdx}
              onMouseDown={e => { e.preventDefault(); commit(t) }}
              onMouseEnter={() => setHighlightIdx(i)}
              className={
                'px-2 py-1 text-sm font-mono cursor-pointer ' +
                (i === highlightIdx ? 'bg-input-bg text-amber' : 'text-text-main hover:bg-input-bg')
              }
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
