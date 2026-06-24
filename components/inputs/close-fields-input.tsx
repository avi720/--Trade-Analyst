'use client'

import { CLOSE_REASONS, type CloseReasonKey } from '@/lib/constants/trade-options'
import { toUtcPreview } from '@/lib/trade/tz'

export interface CloseFieldsValue {
  closePrice: number | null
  closeDate: string   // YYYY-MM-DD
  closeTime: string   // HH:MM
  closeCommission: number
  closeReason: CloseReasonKey | ''
  modifiedStopPrice: number | null
  wouldChange: string
  executionQuality: string  // '' or '1'..'10'
}

export function emptyCloseFields(): CloseFieldsValue {
  const now = new Date()
  return {
    closePrice: null,
    closeDate: now.toISOString().slice(0, 10),
    closeTime: now.toISOString().slice(11, 16),
    closeCommission: 0,
    closeReason: '',
    modifiedStopPrice: null,
    wouldChange: '',
    executionQuality: '',
  }
}

interface Props {
  value: CloseFieldsValue
  onChange: (patch: Partial<CloseFieldsValue>) => void
  hasStop: boolean
  hasTarget: boolean
  timezone?: string
  inputCls: string
  selectCls: string
  labelCls: string
  idPrefix?: string
}

export function CloseFieldsInput({
  value, onChange, hasStop, hasTarget, timezone = 'UTC', inputCls, selectCls, labelCls, idPrefix = 'close-',
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`${idPrefix}price`} className={labelCls}>מחיר סגירה <span className="text-amber" aria-hidden="true">*</span></label>
          <input
            id={`${idPrefix}price`}
            type="number" step="0.01" min="0"
            value={value.closePrice ?? ''}
            onChange={e => {
              const v = parseFloat(e.target.value)
              onChange({ closePrice: isNaN(v) ? null : v })
            }}
            className={inputCls}
            placeholder="0.00"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}date`} className={labelCls}>תאריך סגירה <span className="text-amber" aria-hidden="true">*</span></label>
          <input
            id={`${idPrefix}date`}
            type="date"
            value={value.closeDate}
            onChange={e => onChange({ closeDate: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}time`} className={labelCls}>שעת סגירה <span className="text-amber" aria-hidden="true">*</span></label>
          <input
            id={`${idPrefix}time`}
            type="time"
            value={value.closeTime}
            onChange={e => onChange({ closeTime: e.target.value })}
            className={inputCls}
          />
          {toUtcPreview(value.closeDate, value.closeTime, timezone) && (
            <span
              className="text-[10px] font-mono text-text-dim mt-0.5 block"
              title="שעון אוניברסלי – הזמן שבו האירוע נשמר בבסיס הנתונים"
            >
              = {toUtcPreview(value.closeDate, value.closeTime, timezone)}
            </span>
          )}
        </div>
        <div>
          <label htmlFor={`${idPrefix}commission`} className={labelCls}>עמלת סגירה</label>
          <input
            id={`${idPrefix}commission`}
            type="number" step="0.01" min="0"
            value={value.closeCommission || ''}
            onChange={e => onChange({ closeCommission: parseFloat(e.target.value) || 0 })}
            className={inputCls}
            placeholder="0.00"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}exec-quality`} className={labelCls}>איכות ביצוע (1–10)</label>
          <select
            id={`${idPrefix}exec-quality`}
            value={value.executionQuality}
            onChange={e => onChange({ executionQuality: e.target.value })}
            className={selectCls}
          >
            <option value="">—</option>
            {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={String(n)}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Close reason radio group */}
      <div className="flex flex-col gap-2">
        <span className={labelCls}>איך הטרייד נסגר <span className="text-amber" aria-hidden="true">*</span></span>
        <div className="flex flex-col gap-1.5">
          {CLOSE_REASONS.map(r => {
            const disabled =
              (r.requires === 'stop' && !hasStop) ||
              (r.requires === 'target' && !hasTarget)
            return (
              <label key={r.key} className={`flex items-center gap-2 text-sm font-mono ${disabled ? 'text-text-faint cursor-not-allowed' : 'text-text-main cursor-pointer'}`}>
                <input
                  id={`${idPrefix}reason-${r.key}`}
                  type="radio"
                  name="closeReason"
                  value={r.key}
                  disabled={disabled}
                  checked={value.closeReason === r.key}
                  onChange={() => onChange({ closeReason: r.key })}
                  className="accent-amber"
                />
                {r.label}
                {disabled && r.requires === 'stop' && <span className="text-[10px] text-text-dim">(לא הוזן סטופ)</span>}
                {disabled && r.requires === 'target' && <span className="text-[10px] text-text-dim">(לא הוזן יעד)</span>}
              </label>
            )
          })}
        </div>
        {value.closeReason === 'modified_stop' && (
          <div className="pl-6 mt-1">
            <label htmlFor={`${idPrefix}modified-stop`} className={labelCls}>מחיר סטופ שונה <span className="text-amber" aria-hidden="true">*</span></label>
            <input
              id={`${idPrefix}modified-stop`}
              type="number" step="0.01" min="0"
              value={value.modifiedStopPrice ?? ''}
              onChange={e => {
                const v = parseFloat(e.target.value)
                onChange({ modifiedStopPrice: isNaN(v) ? null : v })
              }}
              className={inputCls + ' max-w-[200px]'}
              placeholder="0.00"
            />
          </div>
        )}
      </div>

      <div>
        <label htmlFor={`${idPrefix}would-change`} className={labelCls}>מה הייתי משנה</label>
        <textarea
          id={`${idPrefix}would-change`}
          rows={2}
          value={value.wouldChange}
          onChange={e => onChange({ wouldChange: e.target.value })}
          className={inputCls + ' resize-none'}
          placeholder="…"
        />
      </div>
    </div>
  )
}
