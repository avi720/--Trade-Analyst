'use client'

import { useState } from 'react'
import { CloseFieldsInput, emptyCloseFields, type CloseFieldsValue } from './inputs/close-fields-input'
import type { RawTrade } from './trade-search'

interface Props {
  trade: RawTrade
  onClose: () => void
  onClosed: (closedTradeId: string) => void
}

const inputCls =
  'w-full bg-[#080808] border border-[#222222] rounded px-2 py-1.5 text-sm text-[#E0E0E0] placeholder-[#444444] focus:outline-none focus:border-[#444444]'
const selectCls = inputCls + ' cursor-pointer'
const labelCls = 'block text-sm font-mono text-[#B0B0B0] mb-1'

export function ManualCloseModal({ trade, onClose, onClosed }: Props) {
  const [value, setValue] = useState<CloseFieldsValue>(emptyCloseFields())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const hasStop = trade.stopPrice != null
  const hasTarget = trade.targetPrice != null

  function patch(p: Partial<CloseFieldsValue>) { setValue(v => ({ ...v, ...p })) }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      if (!value.closePrice || value.closePrice <= 0) {
        setError('יש להזין מחיר סגירה')
        return
      }
      if (!value.closeReason) {
        setError('יש לבחור סיבת סגירה')
        return
      }
      if (value.closeReason === 'modified_stop' && (!value.modifiedStopPrice || value.modifiedStopPrice <= 0)) {
        setError('יש להזין מחיר סטופ שונה')
        return
      }

      const res = await fetch(`/api/trades/${trade.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closePrice: value.closePrice,
          closeDate: value.closeDate,
          closeTime: value.closeTime,
          closeCommission: value.closeCommission,
          closeReason: value.closeReason,
          modifiedStopPrice: value.modifiedStopPrice,
          wouldChange: value.wouldChange || undefined,
          executionQuality: value.executionQuality !== '' ? parseFloat(value.executionQuality) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'שגיאה בסגירה')
        return
      }
      // Parent (TradeSearch) applies the optimistic patch AND triggers the
      // server refresh via patchTrade — so we don't refresh here.
      onClosed(trade.id)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#111111] border border-[#222222] rounded-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222222]">
          <span className="text-sm text-[#B0B0B0] font-mono">סגירה ידנית</span>
          <h2 className="font-mono font-bold text-[#FFB800] text-lg">
            {trade.ticker} — {trade.direction} ({trade.totalQuantity})
          </h2>
          <button onClick={onClose} className="text-[#B0B0B0] hover:text-[#E0E0E0] text-xl leading-none">×</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 text-xs font-mono">
            <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded p-2">
              <div className="text-[#B0B0B0]">מחיר כניסה ממוצע</div>
              <div className="text-[#E0E0E0] mt-0.5">${trade.avgEntryPrice.toFixed(2)}</div>
            </div>
            <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded p-2">
              <div className="text-[#B0B0B0]">סטופ</div>
              <div className="text-[#E0E0E0] mt-0.5">{trade.stopPrice != null ? `$${trade.stopPrice.toFixed(2)}` : '—'}</div>
            </div>
            <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded p-2">
              <div className="text-[#B0B0B0]">יעד</div>
              <div className="text-[#E0E0E0] mt-0.5">{trade.targetPrice != null ? `$${trade.targetPrice.toFixed(2)}` : '—'}</div>
            </div>
          </div>

          <CloseFieldsInput
            value={value}
            onChange={patch}
            hasStop={hasStop}
            hasTarget={hasTarget}
            inputCls={inputCls} selectCls={selectCls} labelCls={labelCls}
          />

          {error && (
            <div className="text-xs text-[#FF4D4D] font-mono border border-[#FF4D4D]/30 bg-[#FF4D4D]/5 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-start">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-[#FFB800] text-black text-sm font-mono font-semibold rounded hover:bg-[#e0a200] disabled:opacity-50 transition-colors"
            >
              {submitting ? 'סוגר…' : 'סגור טרייד'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[#222222] text-[#B0B0B0] text-sm font-mono rounded hover:text-[#E0E0E0] hover:border-[#444444] transition-colors"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
