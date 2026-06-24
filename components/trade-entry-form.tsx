'use client'

import { useState } from 'react'
import type { ManualLeg } from '@/lib/trade/manual-entry'
import { CURRENCIES, BROKERS } from '@/lib/constants/trade-options'
import { TRADE_TIMEZONES, DEFAULT_TIMEZONE, toUtcPreview } from '@/lib/trade/tz'
import { SetupTypeInput } from './inputs/setup-type-input'
import { EmotionalStateInput } from './inputs/emotional-state-input'

const ORDER_TYPES = ['LIMIT', 'MARKET', 'STOP', 'STOP LIMIT', 'MOO', 'MOC']

const EMPTY_LEG = (): ManualLeg => ({
  ticker: '',
  date: new Date().toISOString().slice(0, 10),
  time: '09:30',
  side: 'BUY',
  quantity: 0,
  price: 0,
  commission: 0,
  currency: 'USD',
  commissionCurrency: 'USD',
  broker: 'IBKR',
})

const EXAMPLE_LEG = (): ManualLeg => ({
  ticker: 'AAPL',
  date: new Date().toISOString().slice(0, 10),
  time: '14:30',
  side: 'BUY',
  quantity: 100,
  price: 150,
  commission: 1,
  currency: 'USD',
  commissionCurrency: 'USD',
  broker: 'IBKR',
})

interface Result {
  processed: number
  skipped: number
  failed: number
  errors: string[]
}

const inputCls =
  'w-full bg-bg-dark border border-border rounded px-2 py-1.5 text-sm text-text-main placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 focus:border-shade-2'
const selectCls = inputCls + ' cursor-pointer'
const labelCls = 'block text-sm font-mono text-text-dim mb-1'

interface LegCardProps {
  leg: ManualLeg
  index: number
  canRemove: boolean
  timezone: string
  onChange: (patch: Partial<ManualLeg>) => void
  onRemove: () => void
}

function LegCard({ leg, index, canRemove, timezone, onChange, onRemove }: LegCardProps) {
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(false)

  return (
    <div className="bg-panel border border-border rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2 bg-panel-2 border-b border-input-bg">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-faint">#{index + 1}</span>
          {leg.ticker && (
            <span className="text-xs font-mono font-semibold text-amber bg-amber/10 px-2 py-0.5 rounded">
              {leg.ticker}
            </span>
          )}
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded ${
              leg.side === 'BUY'
                ? 'text-green bg-green/10'
                : 'text-red bg-red/10'
            }`}
          >
            {leg.side === 'BUY' ? 'Long' : 'Short'}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="text-text-dim hover:text-red disabled:opacity-20 text-xl leading-none transition-colors"
          title="הסר ביצוע"
        >
          ×
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* ── Section 1: ביצוע (always visible) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor={`leg-${index}-ticker`} className={labelCls}>טיקר <span className="text-amber" aria-hidden="true">*</span></label>
            <input
              id={`leg-${index}-ticker`}
              type="text"
              value={leg.ticker}
              onChange={e =>
                onChange({ ticker: e.target.value.toUpperCase().replace(/[^A-Z.]/g, '') })
              }
              className={inputCls}
              placeholder="AAPL"
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor={`leg-${index}-side`} className={labelCls}>כיוון <span className="text-amber" aria-hidden="true">*</span></label>
            <select
              id={`leg-${index}-side`}
              value={leg.side}
              onChange={e => onChange({ side: e.target.value as 'BUY' | 'SELL' })}
              className={selectCls}
              aria-required="true"
            >
              <option value="BUY">Long</option>
              <option value="SELL">Short</option>
            </select>
          </div>
          <div>
            <label htmlFor={`leg-${index}-date`} className={labelCls}>תאריך ביצוע <span className="text-amber" aria-hidden="true">*</span></label>
            <input
              id={`leg-${index}-date`}
              type="date"
              value={leg.date}
              onChange={e => onChange({ date: e.target.value })}
              className={inputCls}
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor={`leg-${index}-time`} className={labelCls}>שעת ביצוע <span className="text-amber" aria-hidden="true">*</span></label>
            <input
              id={`leg-${index}-time`}
              type="time"
              value={leg.time}
              onChange={e => onChange({ time: e.target.value })}
              className={inputCls}
              aria-required="true"
            />
            {toUtcPreview(leg.date, leg.time, timezone) && (
              <span
                className="text-[10px] font-mono text-text-dim mt-0.5 block"
                title="שעון אוניברסלי – הזמן שבו האירוע נשמר בבסיס הנתונים"
              >
                = {toUtcPreview(leg.date, leg.time, timezone)}
              </span>
            )}
          </div>
          <div>
            <label htmlFor={`leg-${index}-quantity`} className={labelCls}>כמות <span className="text-amber" aria-hidden="true">*</span></label>
            <input
              id={`leg-${index}-quantity`}
              type="number"
              min="0"
              step="1"
              value={leg.quantity || ''}
              onChange={e => onChange({ quantity: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="100"
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor={`leg-${index}-price`} className={labelCls}>מחיר <span className="text-amber" aria-hidden="true">*</span></label>
            <input
              id={`leg-${index}-price`}
              type="number"
              min="0"
              step="0.01"
              value={leg.price || ''}
              onChange={e => onChange({ price: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="150.00"
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor={`leg-${index}-commission`} className={labelCls}>עמלה <span className="text-amber" aria-hidden="true">*</span></label>
            <input
              id={`leg-${index}-commission`}
              type="number"
              min="0"
              step="0.01"
              value={leg.commission || ''}
              onChange={e => onChange({ commission: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="1.00"
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor={`leg-${index}-currency`} className={labelCls}>מטבע <span className="text-amber" aria-hidden="true">*</span></label>
            <select
              id={`leg-${index}-currency`}
              value={leg.currency}
              onChange={e => {
                const c = e.target.value
                const patch: Partial<ManualLeg> = { currency: c }
                // Mirror to commissionCurrency if it tracked the currency before.
                if (!leg.commissionCurrency || leg.commissionCurrency === leg.currency) {
                  patch.commissionCurrency = c
                }
                onChange(patch)
              }}
              className={selectCls}
              aria-required="true"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* ── Section 2: פרטי הזמנה (collapsible) ── */}
        <div className="border border-input-bg rounded">
          <button
            type="button"
            onClick={() => setShowOrderDetails(v => !v)}
            aria-expanded={showOrderDetails}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-text-fade hover:text-text-main transition-colors"
          >
            <span>פרטי הפקודה אצל הברוקר</span>
            <span aria-hidden="true" className="text-text-faint text-[10px]">{showOrderDetails ? '▲' : '▼'}</span>
          </button>
          {showOrderDetails && (
            <div className="px-3 pb-3 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-input-bg">
              <div>
                <label htmlFor={`leg-${index}-commission-currency`} className={labelCls}>מטבע עמלה</label>
                <select
                  id={`leg-${index}-commission-currency`}
                  value={leg.commissionCurrency ?? leg.currency}
                  onChange={e => onChange({ commissionCurrency: e.target.value })}
                  className={selectCls}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`leg-${index}-order-type`} className={labelCls}>סוג פקודה</label>
                <select
                  id={`leg-${index}-order-type`}
                  value={leg.orderType ?? ''}
                  onChange={e => onChange({ orderType: e.target.value || undefined })}
                  className={selectCls}
                >
                  <option value="">— בחר —</option>
                  {ORDER_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`leg-${index}-order-placed-date`} className={labelCls}>תאריך הגשת פקודה</label>
                <div className="relative">
                  <input
                    id={`leg-${index}-order-placed-date`}
                    type="date"
                    lang="en-GB"
                    data-empty={!leg.orderPlacedDate}
                    value={leg.orderPlacedDate ?? ''}
                    onChange={e => onChange({ orderPlacedDate: e.target.value || undefined })}
                    className={inputCls + ' date-uppercase'}
                    dir="ltr"
                  />
                  {!leg.orderPlacedDate && (
                    <span aria-hidden="true"
                      className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none text-sm font-mono text-text-faint tracking-tight">
                      DD / MM / YYYY
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor={`leg-${index}-order-placed-time`} className={labelCls}>שעת הגשת פקודה</label>
                <input
                  id={`leg-${index}-order-placed-time`}
                  type="time"
                  value={leg.orderPlacedTime ?? ''}
                  onChange={e => onChange({ orderPlacedTime: e.target.value || undefined })}
                  className={inputCls}
                />
                {leg.orderPlacedDate && toUtcPreview(leg.orderPlacedDate, leg.orderPlacedTime ?? '', timezone) && (
                  <span
                    className="text-[10px] font-mono text-text-dim mt-0.5 block"
                    title="שעון אוניברסלי – הזמן שבו האירוע נשמר בבסיס הנתונים"
                  >
                    = {toUtcPreview(leg.orderPlacedDate, leg.orderPlacedTime ?? '', timezone)}
                  </span>
                )}
              </div>
              <div>
                <label htmlFor={`leg-${index}-stop-price`} className={labelCls}>מחיר סטופ</label>
                <input
                  id={`leg-${index}-stop-price`}
                  type="number"
                  step="0.01"
                  value={leg.stopPrice ?? ''}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    onChange({ stopPrice: isNaN(v) ? null : v })
                  }}
                  className={inputCls}
                  placeholder="—"
                />
              </div>
              <div>
                <label htmlFor={`leg-${index}-target-price`} className={labelCls}>מחיר יעד</label>
                <input
                  id={`leg-${index}-target-price`}
                  type="number"
                  step="0.01"
                  value={leg.targetPrice ?? ''}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    onChange({ targetPrice: isNaN(v) ? null : v })
                  }}
                  className={inputCls}
                  placeholder="—"
                />
              </div>
              <div>
                <label htmlFor={`leg-${index}-broker`} className={labelCls}>ברוקר</label>
                <select
                  id={`leg-${index}-broker`}
                  value={leg.broker ?? BROKERS[0]}
                  onChange={e => onChange({ broker: e.target.value })}
                  className={selectCls}
                >
                  {BROKERS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── Section 3: הערות אישיות (collapsible) ── */}
        <div className="border border-input-bg rounded">
          <button
            type="button"
            onClick={() => setShowAnnotations(v => !v)}
            aria-expanded={showAnnotations}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-text-fade hover:text-text-main transition-colors"
          >
            <span>הערות אישיות</span>
            <span aria-hidden="true" className="text-text-faint text-[10px]">{showAnnotations ? '▲' : '▼'}</span>
          </button>
          {showAnnotations && (
            <div className="px-3 pb-3 pt-3 flex flex-col gap-3 border-t border-input-bg">
              <SetupTypeInput
                value={leg.setupType}
                onChange={v => onChange({ setupType: v })}
                inputCls={inputCls}
                selectCls={selectCls}
                labelCls={labelCls}
                idPrefix={`leg-${index}-`}
              />
              <EmotionalStateInput
                value={leg.emotionalState}
                onChange={v => onChange({ emotionalState: v })}
                inputCls={inputCls}
                selectCls={selectCls}
                labelCls={labelCls}
                idPrefix={`leg-${index}-`}
              />
              <div>
                <label htmlFor={`leg-${index}-notes`} className={labelCls}>הערות</label>
                <textarea
                  id={`leg-${index}-notes`}
                  value={leg.notes ?? ''}
                  onChange={e => onChange({ notes: e.target.value || undefined })}
                  className={inputCls + ' resize-none'}
                  rows={2}
                  placeholder="…"
                />
              </div>
              <div>
                <label htmlFor={`leg-${index}-did-right`} className={labelCls}>מה עשיתי נכון</label>
                <textarea
                  id={`leg-${index}-did-right`}
                  value={leg.didRight ?? ''}
                  onChange={e => onChange({ didRight: e.target.value || undefined })}
                  className={inputCls + ' resize-none'}
                  rows={2}
                  placeholder="…"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function TradeEntryForm() {
  const [legs, setLegs] = useState<ManualLeg[]>([EMPTY_LEG()])
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  function updateLeg(i: number, patch: Partial<ManualLeg>) {
    setLegs(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function addLeg() {
    setLegs(prev => [
      ...prev,
      { ...EMPTY_LEG(), ticker: prev[prev.length - 1]?.ticker ?? '' },
    ])
  }

  function loadExample() {
    setLegs([EXAMPLE_LEG()])
    setError('')
    setResult(null)
  }

  function removeLeg(i: number) {
    setLegs(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    setError('')
    setResult(null)

    // Client-side validation — block submission when a required numeric field
    // is missing or zero. type="number" already rejects non-numeric typing,
    // but pasted text or empty fields would otherwise silently submit 0.
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i]
      if (!l.ticker.trim()) { setError(`כרטיס ${i + 1}: חסר טיקר`); return }
      if (!Number.isFinite(l.quantity) || l.quantity <= 0) { setError(`כרטיס ${i + 1}: כמות חייבת להיות מספר גדול מ-0`); return }
      if (!Number.isFinite(l.price) || l.price <= 0) { setError(`כרטיס ${i + 1}: מחיר חייב להיות מספר גדול מ-0`); return }
      if (!Number.isFinite(l.commission) || l.commission < 0) { setError(`כרטיס ${i + 1}: עמלה חייבת להיות מספר אי-שלילי`); return }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/trades/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legs: legs.map(l => ({ ...l, timezone })) }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'שגיאה')
        return
      }
      setResult(json)
      if (json.processed > 0) {
        setLegs([EMPTY_LEG()])
      }
    } catch {
      setError('שגיאת רשת')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-text-main text-sm">הזנת ביצועים ידנית</h2>
        <span className="text-sm text-text-dim font-mono">כל כרטיס = ביצוע פעולה אחת (קנייה/מכירה)</span>
      </div>

      <div className="flex items-center gap-2 text-sm font-mono text-text-dim">
        <span>אזור זמן:</span>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          className="bg-bg-dark border border-border rounded px-2 py-1 text-xs text-text-main cursor-pointer"
        >
          {TRADE_TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-3">
        {legs.map((leg, i) => (
          <LegCard
            key={i}
            leg={leg}
            index={i}
            canRemove={legs.length > 1}
            timezone={timezone}
            onChange={patch => updateLeg(i, patch)}
            onRemove={() => removeLeg(i)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addLeg}
          className="text-sm font-mono text-text-dim hover:text-amber border border-border rounded px-3 py-1.5 transition-colors"
        >
          + הוסף ביצוע
        </button>
        <button
          type="button"
          onClick={loadExample}
          title="מילוי כל השדות בערכי דוגמה — אפשר לערוך לפני שליחה"
          className="text-sm font-mono text-text-dim hover:text-amber border border-border rounded px-3 py-1.5 transition-colors"
        >
          טען דוגמה
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || legs.length === 0}
          className="px-4 py-1.5 bg-amber text-black text-sm font-mono font-semibold rounded hover:bg-amber-dark disabled:opacity-50 transition-colors mr-auto"
        >
          {submitting ? 'שולח…' : 'שלח לעיבוד'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red font-mono border border-red/20 bg-red/5 rounded px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div className="text-xs font-mono border border-border rounded px-3 py-2 flex flex-col gap-1">
          <div className="flex gap-4">
            <span className="text-green">עובדו: {result.processed}</span>
            <span className="text-text-dim">כפולים: {result.skipped}</span>
            {result.failed > 0 && (
              <span className="text-red">נכשלו: {result.failed}</span>
            )}
          </div>
          {result.errors.map((e, i) => (
            <div key={i} className="text-red">
              {e}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-text-faint font-mono border-t border-input-bg pt-3">
        ביצועים זהים (לפי מזהה ייחודי) יזוהו וידחו אוטומטית
      </div>
    </div>
  )
}
