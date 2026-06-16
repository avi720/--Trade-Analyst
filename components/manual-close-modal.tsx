'use client'

import { useState } from 'react'
import { CloseFieldsInput, emptyCloseFields, type CloseFieldsValue } from './inputs/close-fields-input'
import type { RawTrade } from './trade-search'
import { useModalDialog } from '@/lib/utils/use-modal-dialog'

interface Props {
  trade: RawTrade
  onClose: () => void
  onClosed: (closedTradeId: string) => void
}

const inputCls =
  'w-full bg-bg-dark border border-border rounded px-2 py-1.5 text-sm text-text-main placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 focus:border-shade-2'
const selectCls = inputCls + ' cursor-pointer'
const labelCls = 'block text-sm font-mono text-text-dim mb-1'

export function ManualCloseModal({ trade, onClose, onClosed }: Props) {
  const [value, setValue] = useState<CloseFieldsValue>(emptyCloseFields())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useModalDialog(onClose)

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
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-close-title"
        tabIndex={-1}
        className="relative bg-panel border border-border rounded-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm text-text-dim font-mono">סגירה ידנית</span>
          <h2 id="manual-close-title" className="font-mono font-bold text-amber text-lg">
            {trade.ticker} — {trade.direction} ({trade.totalQuantity})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור חלון סגירה ידנית"
            className="w-11 h-11 flex items-center justify-center text-text-dim hover:text-text-main text-2xl leading-none rounded transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 text-xs font-mono">
            <div className="bg-panel-2 border border-input-bg rounded p-2">
              <div className="text-text-dim">מחיר כניסה ממוצע</div>
              <div className="text-text-main mt-0.5">${trade.avgEntryPrice.toFixed(2)}</div>
            </div>
            <div className="bg-panel-2 border border-input-bg rounded p-2">
              <div className="text-text-dim">סטופ</div>
              <div className="text-text-main mt-0.5">{trade.stopPrice != null ? `$${trade.stopPrice.toFixed(2)}` : '—'}</div>
            </div>
            <div className="bg-panel-2 border border-input-bg rounded p-2">
              <div className="text-text-dim">יעד</div>
              <div className="text-text-main mt-0.5">{trade.targetPrice != null ? `$${trade.targetPrice.toFixed(2)}` : '—'}</div>
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
            <div className="text-xs text-red font-mono border border-red/30 bg-red/5 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-start">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-amber text-black text-sm font-mono font-semibold rounded hover:bg-amber-dark disabled:opacity-50 transition-colors"
            >
              {submitting ? 'סוגר…' : 'סגור טרייד'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border text-text-dim text-sm font-mono rounded hover:text-text-main hover:border-shade-2 transition-colors"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
