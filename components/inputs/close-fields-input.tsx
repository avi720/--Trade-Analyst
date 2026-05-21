'use client'

import { CLOSE_REASONS, type CloseReasonKey } from '@/lib/constants/trade-options'

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
  inputCls: string
  selectCls: string
  labelCls: string
}

export function CloseFieldsInput({
  value, onChange, hasStop, hasTarget, inputCls, selectCls, labelCls,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>מחיר סגירה *</label>
          <input
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
          <label className={labelCls}>תאריך סגירה *</label>
          <input
            type="date"
            value={value.closeDate}
            onChange={e => onChange({ closeDate: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>שעת סגירה (UTC) *</label>
          <input
            type="time"
            value={value.closeTime}
            onChange={e => onChange({ closeTime: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>עמלת סגירה</label>
          <input
            type="number" step="0.01" min="0"
            value={value.closeCommission || ''}
            onChange={e => onChange({ closeCommission: parseFloat(e.target.value) || 0 })}
            className={inputCls}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls}>איכות ביצוע (1–10)</label>
          <select
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
        <span className={labelCls}>איך הטרייד נסגר *</span>
        <div className="flex flex-col gap-1.5">
          {CLOSE_REASONS.map(r => {
            const disabled =
              (r.requires === 'stop' && !hasStop) ||
              (r.requires === 'target' && !hasTarget)
            return (
              <label key={r.key} className={`flex items-center gap-2 text-sm font-mono ${disabled ? 'text-[#444444] cursor-not-allowed' : 'text-[#E0E0E0] cursor-pointer'}`}>
                <input
                  type="radio"
                  name="closeReason"
                  value={r.key}
                  disabled={disabled}
                  checked={value.closeReason === r.key}
                  onChange={() => onChange({ closeReason: r.key })}
                  className="accent-[#FFB800]"
                />
                {r.label}
                {disabled && r.requires === 'stop' && <span className="text-[10px] text-[#555555]">(לא הוזן סטופ)</span>}
                {disabled && r.requires === 'target' && <span className="text-[10px] text-[#555555]">(לא הוזן יעד)</span>}
              </label>
            )
          })}
        </div>
        {value.closeReason === 'modified_stop' && (
          <div className="pl-6 mt-1">
            <label className={labelCls}>מחיר סטופ שונה *</label>
            <input
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
        <label className={labelCls}>מה הייתי משנה</label>
        <textarea
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
