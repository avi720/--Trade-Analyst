/**
 * Research dashboard — filter bar.
 *
 * Pure controlled component. Owns no state — all filter values + setters come
 * from the parent. Side-effects (localStorage for holdUnit) live in the parent.
 */

'use client'

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
  hasActiveFilter: boolean
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
      <h2 className="text-[#E0E0E0] text-sm font-sans font-semibold mb-3">סינון</h2>
      <div className="flex flex-wrap gap-3 items-end">

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-date-from" className="text-[#B0B0B0] text-sm font-sans">מתאריך</label>
          <div className="relative">
            <input id="filter-date-from" type="date" lang="en-GB"
              data-empty={!p.dateFrom}
              value={p.dateFrom} onChange={e => p.onDateFromChange(e.target.value)}
              className="input-base date-uppercase text-sm font-mono w-36" dir="ltr" />
            {!p.dateFrom && (
              <span aria-hidden="true"
                className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none text-sm font-mono text-[#B0B0B0] tracking-tight">
                DD / MM / YYYY
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-date-to" className="text-[#B0B0B0] text-sm font-sans">עד תאריך</label>
          <div className="relative">
            <input id="filter-date-to" type="date" lang="en-GB"
              data-empty={!p.dateTo}
              value={p.dateTo} onChange={e => p.onDateToChange(e.target.value)}
              className="input-base date-uppercase text-sm font-mono w-36" dir="ltr" />
            {!p.dateTo && (
              <span aria-hidden="true"
                className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none text-sm font-mono text-[#B0B0B0] tracking-tight">
                DD / MM / YYYY
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-ticker" className="text-[#B0B0B0] text-sm font-sans">טיקר</label>
          <input id="filter-ticker" type="text" placeholder="AAPL..." value={p.tickerFilter}
            onChange={e => p.onTickerChange(e.target.value)}
            className="input-base text-sm font-mono w-24" dir="ltr" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-setup" className="text-[#B0B0B0] text-sm font-sans">סטאפ</label>
          <select id="filter-setup" value={p.setupFilter} onChange={e => p.onSetupChange(e.target.value)}
            className="input-base text-sm font-sans">
            <option value="all">הכל</option>
            {p.setupTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-direction" className="text-[#B0B0B0] text-sm font-sans">כיוון</label>
          <select id="filter-direction" value={p.directionFilter} onChange={e => p.onDirectionChange(e.target.value)}
            className="input-base text-sm font-sans">
            <option value="all">הכל</option>
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-result" className="text-[#B0B0B0] text-sm font-sans">תוצאה</label>
          <select id="filter-result" value={p.resultFilter} onChange={e => p.onResultChange(e.target.value)}
            className="input-base text-sm font-sans">
            <option value="all">הכל</option>
            <option value="Win">Win</option>
            <option value="Loss">Loss</option>
            <option value="Breakeven">Breakeven</option>
          </select>
        </div>

        <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-execqual-label">
          <span id="filter-execqual-label" className="text-[#B0B0B0] text-sm font-sans">איכות ביצוע (1-10)</span>
          <div className="flex gap-1 items-center">
            <input type="number" aria-label="איכות ביצוע מינימלית" placeholder="מינ׳" min={1} max={10} value={p.execQualMin}
              onChange={e => p.onExecQualMinChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
            <span className="text-[#B0B0B0] text-sm" aria-hidden="true">–</span>
            <input type="number" aria-label="איכות ביצוע מקסימלית" placeholder="מקס׳" min={1} max={10} value={p.execQualMax}
              onChange={e => p.onExecQualMaxChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
          </div>
        </div>

        <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-hold-label">
          <span id="filter-hold-label" className="text-[#B0B0B0] text-sm font-sans">
            זמן החזקה ({p.holdUnit === 'days' ? 'ימים' : 'שעות'})
          </span>
          <div className="flex gap-1 items-center">
            <input type="number" aria-label={`זמן החזקה מינימלי ב${p.holdUnit === 'days' ? 'ימים' : 'שעות'}`}
              placeholder="מינ׳" min={0} value={p.holdHoursMin}
              onChange={e => p.onHoldMinChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
            <span className="text-[#B0B0B0] text-sm" aria-hidden="true">–</span>
            <input type="number" aria-label={`זמן החזקה מקסימלי ב${p.holdUnit === 'days' ? 'ימים' : 'שעות'}`}
              placeholder="מקס׳" min={0} value={p.holdHoursMax}
              onChange={e => p.onHoldMaxChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
            <select value={p.holdUnit} onChange={e => p.onHoldUnitChange(e.target.value as HoldUnit)}
              aria-label="יחידת מדידה לזמן ההחזקה"
              className="input-base text-xs font-sans px-1">
              <option value="hours">שעות</option>
              <option value="days">ימים</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-r-label">
          <span id="filter-r-label" className="text-[#B0B0B0] text-sm font-sans">סינון לפי R</span>
          <div className="flex gap-2 items-center">
            <span className="text-[#B0B0B0] text-sm font-sans">מ:</span>
            <input type="number" step="0.1" aria-label="R מינימלי" placeholder="—" value={p.rMin}
              onChange={e => p.onRMinChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
            <span className="text-[#B0B0B0] text-sm font-sans">עד:</span>
            <input type="number" step="0.1" aria-label="R מקסימלי" placeholder="—" value={p.rMax}
              onChange={e => p.onRMaxChange(e.target.value)}
              className="input-base text-sm font-mono w-16" dir="ltr" />
          </div>
        </div>

        <div className="flex-1" />
        <div className="flex items-end gap-2">
          {p.hasActiveFilter && (
            <button onClick={p.onReset}
              className="btn-ghost px-3 py-1.5 text-sm font-sans border border-[#333333] rounded text-[#B0B0B0]">
              נקה פילטרים
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
