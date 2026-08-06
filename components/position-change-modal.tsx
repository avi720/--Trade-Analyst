'use client'

import { useState } from 'react'
import type { RawTrade } from './trade-search'
import { useModalDialog } from '@/lib/utils/use-modal-dialog'
import { positionNotePrefix, type PositionNoteKind } from '@/lib/trade/position-notes'
import { MAX_REASON_LENGTH } from '@/lib/trade/validate-position-change'

/**
 * One modal for both position-change flows — adding money to an open position
 * and selling part of it. The two forms are identical apart from the labels,
 * the quantity rule and the endpoint, so they share a component rather than
 * drifting as two near-copies.
 *
 * The note's lead-in ("בתאריך … הוספתי כסף לפוזיציה כי") is rendered as static
 * text OUTSIDE the textarea and composed server-side. That is what makes it
 * unchangeable: the client only ever sends the reason.
 */

interface Props {
  trade: RawTrade
  kind: PositionNoteKind
  onClose: () => void
  onApplied: (tradeId: string) => void
}

const inputCls =
  'w-full bg-bg-dark border border-border rounded px-2 py-1.5 text-sm text-text-main placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 focus:border-shade-2'
const labelCls = 'block text-sm font-mono text-text-dim mb-1'

const COPY: Record<PositionNoteKind, {
  title: string
  submit: string
  submitting: string
  endpoint: string
  quantityLabel: string
  priceLabel: string
  commissionLabel: string
}> = {
  add: {
    title: 'הוספה לפוזיציה',
    submit: 'הוסף לפוזיציה',
    submitting: 'מוסיף…',
    endpoint: 'add-to-position',
    quantityLabel: 'כמות להוספה',
    priceLabel: 'מחיר קנייה',
    commissionLabel: 'עמלה',
  },
  reduce: {
    title: 'מכירת חלק מהפוזיציה',
    submit: 'מכור חלק',
    submitting: 'מוכר…',
    endpoint: 'reduce-position',
    quantityLabel: 'כמות למכירה',
    priceLabel: 'מחיר מכירה',
    commissionLabel: 'עמלה',
  },
}

export function PositionChangeModal({ trade, kind, onClose, onApplied }: Props) {
  const now = new Date()
  const [quantity, setQuantity] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [commission, setCommission] = useState(0)
  const [date, setDate] = useState(now.toISOString().slice(0, 10))
  const [time, setTime] = useState(now.toISOString().slice(11, 16))
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useModalDialog(onClose)

  const copy = COPY[kind]
  const maxQuantity = kind === 'reduce' ? trade.totalQuantity - 1 : null

  async function handleSubmit() {
    setError('')

    if (!quantity || quantity <= 0) {
      setError('יש להזין כמות')
      return
    }
    if (kind === 'reduce' && quantity >= trade.totalQuantity) {
      setError(
        quantity === trade.totalQuantity
          ? 'מכירה של כל הכמות היא סגירת הטרייד — השתמש בכפתור "סגירת טרייד".'
          : `פתוחות רק ${trade.totalQuantity} יחידות.`
      )
      return
    }
    if (!price || price <= 0) {
      setError('יש להזין מחיר')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/trades/${trade.id}/${copy.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, price, commission, date, time, reason }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'שגיאה')
        return
      }
      onApplied(trade.id)
    } catch {
      setError('שגיאת רשת')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="position-change-title"
        tabIndex={-1}
        className="relative bg-panel border border-border rounded-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm text-text-dim font-mono">{copy.title}</span>
          <h2 id="position-change-title" className="font-mono font-bold text-amber text-lg">
            {trade.ticker} — {trade.direction} ({trade.totalQuantity})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`סגור חלון ${copy.title}`}
            className="w-11 h-11 flex items-center justify-center text-text-dim hover:text-text-main text-2xl leading-none rounded transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 text-xs font-mono">
            <div className="bg-panel-2 border border-input-bg rounded p-2">
              <div className="text-text-dim">כמות פתוחה</div>
              <div className="text-text-main mt-0.5">{trade.totalQuantity}</div>
            </div>
            <div className="bg-panel-2 border border-input-bg rounded p-2">
              <div className="text-text-dim">מחיר כניסה ממוצע</div>
              <div className="text-text-main mt-0.5">${trade.avgEntryPrice.toFixed(2)}</div>
            </div>
            <div className="bg-panel-2 border border-input-bg rounded p-2">
              <div className="text-text-dim">סטופ</div>
              <div className="text-text-main mt-0.5">
                {trade.stopPrice != null ? `$${trade.stopPrice.toFixed(2)}` : '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="pc-quantity" className={labelCls}>
                {copy.quantityLabel} <span className="text-amber" aria-hidden="true">*</span>
              </label>
              <input
                id="pc-quantity"
                type="number" step="1" min="1"
                max={maxQuantity ?? undefined}
                value={quantity ?? ''}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  setQuantity(isNaN(v) ? null : v)
                }}
                className={inputCls}
                placeholder="0"
              />
              {kind === 'reduce' && (
                <span className="text-[10px] font-mono text-text-dim mt-0.5 block">
                  עד {trade.totalQuantity - 1} — למכירת הכל השתמש בסגירת טרייד
                </span>
              )}
            </div>
            <div>
              <label htmlFor="pc-price" className={labelCls}>
                {copy.priceLabel} <span className="text-amber" aria-hidden="true">*</span>
              </label>
              <input
                id="pc-price"
                type="number" step="0.01" min="0"
                value={price ?? ''}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  setPrice(isNaN(v) ? null : v)
                }}
                className={inputCls}
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="pc-commission" className={labelCls}>{copy.commissionLabel}</label>
              <input
                id="pc-commission"
                type="number" step="0.01" min="0"
                value={commission || ''}
                onChange={e => setCommission(parseFloat(e.target.value) || 0)}
                className={inputCls}
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="pc-date" className={labelCls}>
                תאריך <span className="text-amber" aria-hidden="true">*</span>
              </label>
              <input
                id="pc-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="pc-time" className={labelCls}>
                שעה (UTC) <span className="text-amber" aria-hidden="true">*</span>
              </label>
              <input
                id="pc-time"
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Fixed prefix + free-text reason. The prefix is not editable — it is
              what distinguishes these lines from ordinary notes. */}
          <div>
            <label htmlFor="pc-reason" className={labelCls}>סיבה (אופציונלי)</label>
            <div className="flex flex-col gap-1.5 border border-input-bg rounded p-2 bg-panel-2">
              <span className="text-xs font-mono text-amber" data-testid="pc-note-prefix">
                {positionNotePrefix(kind, date)}
              </span>
              <textarea
                id="pc-reason"
                rows={2}
                maxLength={MAX_REASON_LENGTH}
                value={reason}
                onChange={e => setReason(e.target.value)}
                className={inputCls + ' resize-none'}
                placeholder="…"
              />
              <span className="text-[10px] font-mono text-text-dim">
                {reason.trim()
                  ? 'הטקסט יצורף להערות הטרייד עם הקידומת הקבועה שלמעלה.'
                  : 'בלי סיבה לא תתווסף שום הערה.'}
              </span>
            </div>
          </div>

          {error && (
            <div role="alert" className="text-xs text-red font-mono border border-red/30 bg-red/5 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-start">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-amber text-black text-sm font-mono font-semibold rounded hover:bg-amber-dark disabled:opacity-50 transition-colors"
            >
              {submitting ? copy.submitting : copy.submit}
            </button>
            <button
              type="button"
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
