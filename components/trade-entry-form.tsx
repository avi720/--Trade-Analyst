'use client'

import { useState } from 'react'
import type { ManualLeg } from '@/lib/trade/manual-entry'

const EMPTY_LEG = (): ManualLeg => ({
  ticker: '',
  date: new Date().toISOString().slice(0, 10),
  time: '09:30',
  side: 'BUY',
  quantity: 0,
  price: 0,
  commission: 0,
  currency: 'USD',
})

interface Result {
  processed: number
  skipped: number
  failed: number
  errors: string[]
}

export function TradeEntryForm() {
  const [legs, setLegs] = useState<ManualLeg[]>([EMPTY_LEG()])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  function updateLeg(i: number, patch: Partial<ManualLeg>) {
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  function addLeg() {
    setLegs(prev => [...prev, { ...EMPTY_LEG(), ticker: prev[prev.length - 1]?.ticker ?? '' }])
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
        // Reset form on full success
        setLegs([EMPTY_LEG()])
      }
    } catch {
      setError('שגיאת רשת')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'bg-[#080808] border border-[#222222] rounded px-2 py-1 text-sm text-[#E0E0E0] placeholder-[#444444] focus:outline-none focus:border-[#444444] w-full'
  const selectCls = inputCls + ' cursor-pointer'

  return (
    <div className="panel p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[#E0E0E0] text-sm">הזנת ביצועים ידנית</h2>
        <span className="text-xs text-[#555555] font-mono">כל שורה = ביצוע אחד (leg)</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_120px_80px_70px_90px_90px_90px_80px_32px] gap-2 text-xs font-mono text-[#555555] px-1">
        <span>טיקר</span><span>תאריך</span><span>שעה</span>
        <span>צד</span><span>כמות</span><span>מחיר</span>
        <span>עמ׳</span><span>מטבע</span><span></span>
      </div>

      {/* Leg rows */}
      <div className="flex flex-col gap-2">
        {legs.map((leg, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_80px_70px_90px_90px_90px_80px_32px] gap-2 items-center">
            <input
              type="text"
              value={leg.ticker}
              onChange={e => updateLeg(i, { ticker: e.target.value.toUpperCase() })}
              className={inputCls}
              placeholder="AAPL"
            />
            <input
              type="date"
              value={leg.date}
              onChange={e => updateLeg(i, { date: e.target.value })}
              className={inputCls}
            />
            <input
              type="time"
              value={leg.time}
              onChange={e => updateLeg(i, { time: e.target.value })}
              className={inputCls}
            />
            <select
              value={leg.side}
              onChange={e => updateLeg(i, { side: e.target.value as 'BUY' | 'SELL' })}
              className={selectCls}
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
            <input
              type="number"
              min="0"
              step="1"
              value={leg.quantity || ''}
              onChange={e => updateLeg(i, { quantity: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="100"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={leg.price || ''}
              onChange={e => updateLeg(i, { price: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="150.00"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={leg.commission || ''}
              onChange={e => updateLeg(i, { commission: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="1.00"
            />
            <input
              type="text"
              value={leg.currency}
              onChange={e => updateLeg(i, { currency: e.target.value.toUpperCase() })}
              className={inputCls}
              placeholder="USD"
              maxLength={3}
            />
            <button
              onClick={() => removeLeg(i)}
              disabled={legs.length === 1}
              className="text-[#555555] hover:text-[#FF4D4D] disabled:opacity-20 text-lg leading-none transition-colors"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={addLeg}
          className="text-sm font-mono text-[#888888] hover:text-[#FFB800] border border-[#222222] rounded px-3 py-1.5 transition-colors"
        >
          + הוסף שורה
        </button>

        <button
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
            {result.failed > 0 && <span className="text-[#FF4D4D]">נכשלו: {result.failed}</span>}
          </div>
          {result.errors.map((e, i) => (
            <div key={i} className="text-[#FF4D4D]">{e}</div>
          ))}
        </div>
      )}

      <div className="text-xs text-[#444444] font-mono border-t border-[#1A1A1A] pt-3">
        הביצועים עוברים דרך אותו pipeline FIFO כמו IBKR — כפולים (לפי brokerExecId) יידחו אוטומטית
      </div>
    </div>
  )
}
