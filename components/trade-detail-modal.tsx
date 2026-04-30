'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RawTrade } from './trade-search'

interface Order {
  id: string
  executedAt: string
  side: string
  quantity: number
  price: number
  commission: number | null
  currency: string | null
}

interface Props {
  trade: RawTrade
  onClose: () => void
  onSaved: (updated: RawTrade) => void
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return s.slice(0, 16).replace('T', ' ')
}

function fmtUsd(n: number | null) {
  if (n == null) return '—'
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const SOFT_FIELDS = ['notes', 'setupType', 'emotionalState', 'executionQuality', 'stopPrice', 'targetPrice', 'didRight', 'wouldChange'] as const

export function TradeDetailModal({ trade, onClose, onSaved }: Props) {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Soft field form state
  const [notes, setNotes] = useState(trade.notes ?? '')
  const [setupType, setSetupType] = useState(trade.setupType ?? '')
  const [emotionalState, setEmotionalState] = useState(trade.emotionalState ?? '')
  const [executionQuality, setExecutionQuality] = useState(trade.executionQuality?.toString() ?? '')
  const [stopPrice, setStopPrice] = useState(trade.stopPrice?.toString() ?? '')
  const [targetPrice, setTargetPrice] = useState(trade.targetPrice?.toString() ?? '')
  const [didRight, setDidRight] = useState(trade.didRight ?? '')
  const [wouldChange, setWouldChange] = useState(trade.wouldChange ?? '')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('Order')
      .select('id, executedAt, side, quantity, price, commission, currency')
      .eq('tradeId', trade.id)
      .order('executedAt', { ascending: true })
      .then(({ data }) => {
        setOrders(data ?? [])
        setLoadingOrders(false)
      })
  }, [trade.id])

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const body: Record<string, unknown> = {
        notes: notes || null,
        setupType: setupType || null,
        emotionalState: emotionalState || null,
        executionQuality: executionQuality !== '' ? parseFloat(executionQuality) : null,
        stopPrice: stopPrice !== '' ? parseFloat(stopPrice) : null,
        targetPrice: targetPrice !== '' ? parseFloat(targetPrice) : null,
        didRight: didRight || null,
        wouldChange: wouldChange || null,
      }

      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'שגיאה' }))
        setSaveError(err.error ?? 'שגיאה בשמירה')
        return
      }

      const updated: RawTrade = {
        ...trade,
        notes: body.notes as string | null,
        setupType: body.setupType as string | null,
        emotionalState: body.emotionalState as string | null,
        executionQuality: body.executionQuality as number | null,
        stopPrice: body.stopPrice as number | null,
        targetPrice: body.targetPrice as number | null,
        didRight: body.didRight as string | null,
        wouldChange: body.wouldChange as string | null,
      }
      onSaved(updated)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-[#080808] border border-[#222222] rounded px-2 py-1.5 text-sm text-[#E0E0E0] placeholder-[#444444] focus:outline-none focus:border-[#444444]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#111111] border border-[#222222] rounded-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222222]">
          <span className="text-xs text-[#888888] font-mono">
            {trade.status === 'Open' ? 'פתוח' : 'סגור'}
          </span>
          <h2 className="font-mono font-bold text-[#FFB800] text-lg">
            {trade.ticker} — {trade.direction}
          </h2>
          <button onClick={onClose} className="text-[#888888] hover:text-[#E0E0E0] text-xl leading-none">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Trade summary */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              ['פתיחה', fmtDate(trade.openedAt)],
              ['סגירה', fmtDate(trade.closedAt)],
              ['כמות', trade.totalQuantityOpened.toString()],
              ['מחיר כניסה', `$${trade.avgEntryPrice.toFixed(2)}`],
              ['מחיר יציאה', trade.avgExitPrice != null ? `$${trade.avgExitPrice.toFixed(2)}` : '—'],
              ['P&L', fmtUsd(trade.realizedPnl)],
              ['R', trade.actualR != null ? (trade.actualR >= 0 ? '+' : '') + trade.actualR.toFixed(2) + 'R' : '—'],
              ['עמ׳', trade.totalCommission != null ? `$${Math.abs(trade.totalCommission).toFixed(2)}` : '—'],
              ['תוצאה', trade.result ?? '—'],
            ].map(([label, val]) => (
              <div key={label} className="bg-[#0D0D0D] border border-[#1A1A1A] rounded p-2">
                <div className="text-xs text-[#555555] font-mono">{label}</div>
                <div className="text-[#E0E0E0] font-mono text-sm mt-0.5">{val}</div>
              </div>
            ))}
          </div>

          {/* Orders sub-table */}
          <div>
            <h3 className="text-xs font-mono text-[#888888] mb-2">ביצועים (Orders)</h3>
            {loadingOrders ? (
              <div className="text-xs text-[#555555] font-mono">טוען…</div>
            ) : orders.length === 0 ? (
              <div className="text-xs text-[#555555] font-mono">אין ביצועים</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#1A1A1A] text-[#555555]">
                      <th className="text-right py-1 px-2">תאריך/שעה</th>
                      <th className="text-right py-1 px-2">צד</th>
                      <th className="text-right py-1 px-2">כמות</th>
                      <th className="text-right py-1 px-2">מחיר</th>
                      <th className="text-right py-1 px-2">עמ׳</th>
                      <th className="text-right py-1 px-2">מטבע</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} className="border-b border-[#0D0D0D]">
                        <td className="py-1 px-2 text-[#888888]">{fmtDate(o.executedAt)}</td>
                        <td className={`py-1 px-2 ${o.side === 'BUY' ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}`}>{o.side}</td>
                        <td className="py-1 px-2 text-[#E0E0E0]">{o.quantity}</td>
                        <td className="py-1 px-2 text-[#E0E0E0]">${o.price.toFixed(2)}</td>
                        <td className="py-1 px-2 text-[#888888]">{o.commission != null ? `$${o.commission.toFixed(2)}` : '—'}</td>
                        <td className="py-1 px-2 text-[#888888]">{o.currency ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Soft fields form */}
          <div>
            <h3 className="text-xs font-mono text-[#888888] mb-3">עריכה</h3>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#555555] font-mono block mb-1">סטאפ</label>
                  <input type="text" value={setupType} onChange={e => setSetupType(e.target.value)} className={inputCls} placeholder="breakout, pullback…" />
                </div>
                <div>
                  <label className="text-xs text-[#555555] font-mono block mb-1">מצב רגשי</label>
                  <input type="text" value={emotionalState} onChange={e => setEmotionalState(e.target.value)} className={inputCls} placeholder="רגוע, לחוץ…" />
                </div>
                <div>
                  <label className="text-xs text-[#555555] font-mono block mb-1">Stop</label>
                  <input type="number" step="0.01" value={stopPrice} onChange={e => setStopPrice(e.target.value)} className={inputCls} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-[#555555] font-mono block mb-1">Target</label>
                  <input type="number" step="0.01" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} className={inputCls} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-[#555555] font-mono block mb-1">איכות ביצוע (1–5)</label>
                  <input type="number" min="1" max="5" step="1" value={executionQuality} onChange={e => setExecutionQuality(e.target.value)} className={inputCls} placeholder="—" />
                </div>
              </div>

              <div>
                <label className="text-xs text-[#555555] font-mono block mb-1">הערות</label>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inputCls + ' resize-none'} placeholder="הערות חופשיות…" />
              </div>
              <div>
                <label className="text-xs text-[#555555] font-mono block mb-1">מה עשיתי נכון</label>
                <textarea rows={2} value={didRight} onChange={e => setDidRight(e.target.value)} className={inputCls + ' resize-none'} placeholder="…" />
              </div>
              <div>
                <label className="text-xs text-[#555555] font-mono block mb-1">מה הייתי משנה</label>
                <textarea rows={2} value={wouldChange} onChange={e => setWouldChange(e.target.value)} className={inputCls + ' resize-none'} placeholder="…" />
              </div>
            </div>
          </div>

          {saveError && (
            <div className="text-xs text-[#FF4D4D] font-mono">{saveError}</div>
          )}

          <div className="flex gap-2 justify-start">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[#FFB800] text-black text-sm font-mono font-semibold rounded hover:bg-[#e0a200] disabled:opacity-50 transition-colors"
            >
              {saving ? 'שומר…' : 'שמור'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[#222222] text-[#888888] text-sm font-mono rounded hover:text-[#E0E0E0] hover:border-[#444444] transition-colors"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
