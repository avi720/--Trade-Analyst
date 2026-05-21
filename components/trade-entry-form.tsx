'use client'

import { useState } from 'react'
import type { ManualLeg } from '@/lib/trade/manual-entry'
import { CURRENCIES, BROKERS } from '@/lib/constants/trade-options'
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

interface Result {
  processed: number
  skipped: number
  failed: number
  errors: string[]
}

const inputCls =
  'w-full bg-[#080808] border border-[#222222] rounded px-2 py-1.5 text-sm text-[#E0E0E0] placeholder-[#444444] focus:outline-none focus:border-[#444444]'
const selectCls = inputCls + ' cursor-pointer'
const labelCls = 'block text-xs font-mono text-[#555555] mb-1'

interface LegCardProps {
  leg: ManualLeg
  index: number
  canRemove: boolean
  onChange: (patch: Partial<ManualLeg>) => void
  onRemove: () => void
}

function LegCard({ leg, index, canRemove, onChange, onRemove }: LegCardProps) {
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(false)

  return (
    <div className="bg-[#111111] border border-[#222222] rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0D0D0D] border-b border-[#1A1A1A]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#444444]">#{index + 1}</span>
          {leg.ticker && (
            <span className="text-xs font-mono font-semibold text-[#FFB800] bg-[#FFB800]/10 px-2 py-0.5 rounded">
              {leg.ticker}
            </span>
          )}
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded ${
              leg.side === 'BUY'
                ? 'text-[#2CC84A] bg-[#2CC84A]/10'
                : 'text-[#FF4D4D] bg-[#FF4D4D]/10'
            }`}
          >
            {leg.side}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="text-[#555555] hover:text-[#FF4D4D] disabled:opacity-20 text-xl leading-none transition-colors"
          title="הסר ביצוע"
        >
          ×
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* ── Section 1: ביצוע (always visible) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>טיקר</label>
            <input
              type="text"
              value={leg.ticker}
              onChange={e =>
                onChange({ ticker: e.target.value.toUpperCase().replace(/[^A-Z.]/g, '') })
              }
              className={inputCls}
              placeholder="AAPL"
            />
          </div>
          <div>
            <label className={labelCls}>צד</label>
            <select
              value={leg.side}
              onChange={e => onChange({ side: e.target.value as 'BUY' | 'SELL' })}
              className={selectCls}
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>תאריך ביצוע</label>
            <input
              type="date"
              value={leg.date}
              onChange={e => onChange({ date: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>שעת ביצוע (UTC)</label>
            <input
              type="time"
              value={leg.time}
              onChange={e => onChange({ time: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>כמות</label>
            <input
              type="number"
              min="0"
              step="1"
              value={leg.quantity || ''}
              onChange={e => onChange({ quantity: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="100"
            />
          </div>
          <div>
            <label className={labelCls}>מחיר</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={leg.price || ''}
              onChange={e => onChange({ price: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="150.00"
            />
          </div>
          <div>
            <label className={labelCls}>עמלה</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={leg.commission || ''}
              onChange={e => onChange({ commission: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="1.00"
            />
          </div>
          <div>
            <label className={labelCls}>מטבע</label>
            <select
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
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* ── Section 2: פרטי הזמנה (collapsible) ── */}
        <div className="border border-[#1A1A1A] rounded">
          <button
            type="button"
            onClick={() => setShowOrderDetails(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-[#666666] hover:text-[#E0E0E0] transition-colors"
          >
            <span>פרטי הזמנה</span>
            <span className="text-[#444444] text-[10px]">{showOrderDetails ? '▲' : '▼'}</span>
          </button>
          {showOrderDetails && (
            <div className="px-3 pb-3 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-[#1A1A1A]">
              <div>
                <label className={labelCls}>מטבע עמלה</label>
                <select
                  value={leg.commissionCurrency ?? leg.currency}
                  onChange={e => onChange({ commissionCurrency: e.target.value })}
                  className={selectCls}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>סוג פקודה</label>
                <select
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
                <label className={labelCls}>תאריך הגשת פקודה</label>
                <input
                  type="date"
                  value={leg.orderPlacedDate ?? ''}
                  onChange={e => onChange({ orderPlacedDate: e.target.value || undefined })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>שעת הגשת פקודה (UTC)</label>
                <input
                  type="time"
                  value={leg.orderPlacedTime ?? ''}
                  onChange={e => onChange({ orderPlacedTime: e.target.value || undefined })}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>ברוקר</label>
                <select
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
        <div className="border border-[#1A1A1A] rounded">
          <button
            type="button"
            onClick={() => setShowAnnotations(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-[#666666] hover:text-[#E0E0E0] transition-colors"
          >
            <span>הערות אישיות</span>
            <span className="text-[#444444] text-[10px]">{showAnnotations ? '▲' : '▼'}</span>
          </button>
          {showAnnotations && (
            <div className="px-3 pb-3 pt-3 flex flex-col gap-3 border-t border-[#1A1A1A]">
              <SetupTypeInput
                value={leg.setupType}
                onChange={v => onChange({ setupType: v })}
                inputCls={inputCls}
                selectCls={selectCls}
                labelCls={labelCls}
              />
              <EmotionalStateInput
                value={leg.emotionalState}
                onChange={v => onChange({ emotionalState: v })}
                inputCls={inputCls}
                selectCls={selectCls}
                labelCls={labelCls}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>מחיר עצירה</label>
                  <input
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
                  <label className={labelCls}>מחיר יעד</label>
                  <input
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
              </div>
              <div>
                <label className={labelCls}>הערות</label>
                <textarea
                  value={leg.notes ?? ''}
                  onChange={e => onChange({ notes: e.target.value || undefined })}
                  className={inputCls + ' resize-none'}
                  rows={2}
                  placeholder="…"
                />
              </div>
              <div>
                <label className={labelCls}>מה עשיתי נכון</label>
                <textarea
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

  function removeLeg(i: number) {
    setLegs(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/trades/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legs }),
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
        <h2 className="font-mono text-[#E0E0E0] text-sm">הזנת ביצועים ידנית</h2>
        <span className="text-xs text-[#555555] font-mono">כל כרטיס = ביצוע אחד (leg)</span>
      </div>

      <div className="flex flex-col gap-3">
        {legs.map((leg, i) => (
          <LegCard
            key={i}
            leg={leg}
            index={i}
            canRemove={legs.length > 1}
            onChange={patch => updateLeg(i, patch)}
            onRemove={() => removeLeg(i)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addLeg}
          className="text-sm font-mono text-[#888888] hover:text-[#FFB800] border border-[#222222] rounded px-3 py-1.5 transition-colors"
        >
          + הוסף ביצוע
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || legs.length === 0}
          className="px-4 py-1.5 bg-[#FFB800] text-black text-sm font-mono font-semibold rounded hover:bg-[#e0a200] disabled:opacity-50 transition-colors mr-auto"
        >
          {submitting ? 'שולח…' : 'שלח לעיבוד'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-[#FF4D4D] font-mono border border-[#FF4D4D]/20 bg-[#FF4D4D]/5 rounded px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div className="text-xs font-mono border border-[#222222] rounded px-3 py-2 flex flex-col gap-1">
          <div className="flex gap-4">
            <span className="text-[#2CC84A]">עובדו: {result.processed}</span>
            <span className="text-[#888888]">כפולים: {result.skipped}</span>
            {result.failed > 0 && (
              <span className="text-[#FF4D4D]">נכשלו: {result.failed}</span>
            )}
          </div>
          {result.errors.map((e, i) => (
            <div key={i} className="text-[#FF4D4D]">
              {e}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-[#444444] font-mono border-t border-[#1A1A1A] pt-3">
        הביצועים עוברים דרך אותו pipeline FIFO כמו IBKR — כפולים (לפי brokerExecId) יידחו אוטומטית
      </div>
    </div>
  )
}
