'use client'

import { useState } from 'react'
import type { ManualLeg } from '@/lib/trade/manual-entry'
import { CURRENCIES, BROKERS } from '@/lib/constants/trade-options'
import { TRADE_TIMEZONES, DEFAULT_TIMEZONE, toUtcPreview } from '@/lib/trade/tz'
import { SetupTypeInput } from './inputs/setup-type-input'
import { EmotionalStateInput } from './inputs/emotional-state-input'
import { CloseFieldsInput, emptyCloseFields, type CloseFieldsValue } from './inputs/close-fields-input'

const ORDER_TYPES = ['LIMIT', 'MARKET', 'STOP', 'STOP LIMIT', 'MOO', 'MOC']

const EMPTY_OPEN = (): ManualLeg => ({
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

const inputCls =
  'w-full bg-[#080808] border border-[#222222] rounded px-2 py-1.5 text-sm text-[#E0E0E0] placeholder-[#444444] focus:outline-none focus:border-[#444444]'
const selectCls = inputCls + ' cursor-pointer'
const labelCls = 'block text-xs font-mono text-[#555555] mb-1'

export function ClosedTradeEntryForm() {
  const [open, setOpen] = useState<ManualLeg>(EMPTY_OPEN())
  const [close, setClose] = useState<CloseFieldsValue>(emptyCloseFields())
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(true)

  function patchOpen(p: Partial<ManualLeg>) { setOpen(o => ({ ...o, ...p })) }
  function patchClose(p: Partial<CloseFieldsValue>) { setClose(c => ({ ...c, ...p })) }

  async function handleSubmit() {
    setSubmitting(true)
    setMessage(null)
    try {
      // Client-side guard for required close fields
      if (!close.closePrice || close.closePrice <= 0) {
        setMessage({ kind: 'err', text: 'יש להזין מחיר סגירה' })
        return
      }
      if (!close.closeReason) {
        setMessage({ kind: 'err', text: 'יש לבחור סיבת סגירה' })
        return
      }
      if (close.closeReason === 'modified_stop' && (!close.modifiedStopPrice || close.modifiedStopPrice <= 0)) {
        setMessage({ kind: 'err', text: 'יש להזין מחיר סטופ שונה' })
        return
      }

      const payload = {
        open: { ...open, timezone },
        close: {
          closePrice: close.closePrice,
          closeDate: close.closeDate,
          closeTime: close.closeTime,
          closeCommission: close.closeCommission,
          closeReason: close.closeReason,
          modifiedStopPrice: close.modifiedStopPrice,
          wouldChange: close.wouldChange || undefined,
          executionQuality: close.executionQuality !== '' ? parseFloat(close.executionQuality) : null,
        },
      }
      const res = await fetch('/api/trades/manual/closed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ kind: 'err', text: json.error ?? 'שגיאה' })
        return
      }
      setMessage({ kind: 'ok', text: 'הטרייד נשמר ונסגר בהצלחה' })
      setOpen(EMPTY_OPEN())
      setClose(emptyCloseFields())
    } catch {
      setMessage({ kind: 'err', text: 'שגיאת רשת' })
    } finally {
      setSubmitting(false)
    }
  }

  const hasStop = open.stopPrice != null && Number.isFinite(open.stopPrice as number)
  const hasTarget = open.targetPrice != null && Number.isFinite(open.targetPrice as number)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[#E0E0E0] text-sm">הזנת טרייד שכבר נסגר</h2>
        <span className="text-xs text-[#555555] font-mono">פתיחה + סגירה בטופס אחד</span>
      </div>

      <div className="flex items-center gap-2 text-xs font-mono text-[#555555]">
        <span>אזור זמן:</span>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          className="bg-[#080808] border border-[#222222] rounded px-2 py-1 text-xs text-[#E0E0E0] cursor-pointer"
        >
          {TRADE_TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>

      {/* ── Open section ─────────────────────────────────────────────── */}
      <div className="bg-[#111111] border border-[#222222] rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-[#0D0D0D] border-b border-[#1A1A1A] text-xs font-mono text-[#FFB800]">
          פתיחת הטרייד
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="open-ticker" className={labelCls}>טיקר <span className="text-[#FFB800]" aria-hidden="true">*</span></label>
              <input id="open-ticker" type="text"
                value={open.ticker}
                onChange={e => patchOpen({ ticker: e.target.value.toUpperCase().replace(/[^A-Z.]/g, '') })}
                className={inputCls} placeholder="AAPL" aria-required="true" />
            </div>
            <div>
              <label htmlFor="open-side" className={labelCls}>צד <span className="text-[#FFB800]" aria-hidden="true">*</span></label>
              <select id="open-side" value={open.side} onChange={e => patchOpen({ side: e.target.value as 'BUY' | 'SELL' })} className={selectCls} aria-required="true">
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div>
              <label htmlFor="open-date" className={labelCls}>תאריך <span className="text-[#FFB800]" aria-hidden="true">*</span></label>
              <input id="open-date" type="date" value={open.date} onChange={e => patchOpen({ date: e.target.value })} className={inputCls} aria-required="true" />
            </div>
            <div>
              <label htmlFor="open-time" className={labelCls}>שעה <span className="text-[#FFB800]" aria-hidden="true">*</span></label>
              <input id="open-time" type="time" value={open.time} onChange={e => patchOpen({ time: e.target.value })} className={inputCls} aria-required="true" />
              {toUtcPreview(open.date, open.time, timezone) && (
                <span className="text-[10px] font-mono text-[#555555] mt-0.5 block">
                  = {toUtcPreview(open.date, open.time, timezone)}
                </span>
              )}
            </div>
            <div>
              <label htmlFor="open-quantity" className={labelCls}>כמות <span className="text-[#FFB800]" aria-hidden="true">*</span></label>
              <input id="open-quantity" type="number" min="0" step="1" value={open.quantity || ''}
                onChange={e => patchOpen({ quantity: parseFloat(e.target.value) || 0 })}
                className={inputCls} placeholder="100" aria-required="true" />
            </div>
            <div>
              <label htmlFor="open-price" className={labelCls}>מחיר <span className="text-[#FFB800]" aria-hidden="true">*</span></label>
              <input id="open-price" type="number" min="0" step="0.01" value={open.price || ''}
                onChange={e => patchOpen({ price: parseFloat(e.target.value) || 0 })}
                className={inputCls} placeholder="150.00" aria-required="true" />
            </div>
            <div>
              <label htmlFor="open-commission" className={labelCls}>עמלה <span className="text-[#FFB800]" aria-hidden="true">*</span></label>
              <input id="open-commission" type="number" min="0" step="0.01" value={open.commission || ''}
                onChange={e => patchOpen({ commission: parseFloat(e.target.value) || 0 })}
                className={inputCls} placeholder="1.00" aria-required="true" />
            </div>
            <div>
              <label htmlFor="open-currency" className={labelCls}>מטבע <span className="text-[#FFB800]" aria-hidden="true">*</span></label>
              <select id="open-currency" value={open.currency}
                onChange={e => {
                  const c = e.target.value
                  const patch: Partial<ManualLeg> = { currency: c }
                  if (!open.commissionCurrency || open.commissionCurrency === open.currency) {
                    patch.commissionCurrency = c
                  }
                  patchOpen(patch)
                }}
                className={selectCls} aria-required="true">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* פרטי הזמנה */}
          <div className="border border-[#1A1A1A] rounded">
            <button type="button" onClick={() => setShowOrderDetails(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-[#666666] hover:text-[#E0E0E0] transition-colors">
              <span>פרטי הזמנה</span>
              <span className="text-[#444444] text-[10px]">{showOrderDetails ? '▲' : '▼'}</span>
            </button>
            {showOrderDetails && (
              <div className="px-3 pb-3 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-[#1A1A1A]">
                <div>
                  <label htmlFor="open-commission-currency" className={labelCls}>מטבע עמלה</label>
                  <select id="open-commission-currency" value={open.commissionCurrency ?? open.currency}
                    onChange={e => patchOpen({ commissionCurrency: e.target.value })}
                    className={selectCls}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="open-order-type" className={labelCls}>סוג פקודה</label>
                  <select id="open-order-type" value={open.orderType ?? ''}
                    onChange={e => patchOpen({ orderType: e.target.value || undefined })}
                    className={selectCls}>
                    <option value="">— בחר —</option>
                    {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="open-order-placed-date" className={labelCls}>תאריך הגשת פקודה</label>
                  <input id="open-order-placed-date" type="date" value={open.orderPlacedDate ?? ''}
                    onChange={e => patchOpen({ orderPlacedDate: e.target.value || undefined })}
                    className={inputCls} />
                </div>
                <div>
                  <label htmlFor="open-order-placed-time" className={labelCls}>שעת הגשת פקודה</label>
                  <input id="open-order-placed-time" type="time" value={open.orderPlacedTime ?? ''}
                    onChange={e => patchOpen({ orderPlacedTime: e.target.value || undefined })}
                    className={inputCls} />
                  {open.orderPlacedDate && toUtcPreview(open.orderPlacedDate, open.orderPlacedTime ?? '', timezone) && (
                    <span className="text-[10px] font-mono text-[#555555] mt-0.5 block">
                      = {toUtcPreview(open.orderPlacedDate, open.orderPlacedTime ?? '', timezone)}
                    </span>
                  )}
                </div>
                <div className="col-span-2">
                  <label htmlFor="open-broker" className={labelCls}>ברוקר</label>
                  <select id="open-broker" value={open.broker ?? BROKERS[0]}
                    onChange={e => patchOpen({ broker: e.target.value })}
                    className={selectCls}>
                    {BROKERS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* הערות אישיות */}
          <div className="border border-[#1A1A1A] rounded">
            <button type="button" onClick={() => setShowAnnotations(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-[#666666] hover:text-[#E0E0E0] transition-colors">
              <span>הערות אישיות (פתיחה)</span>
              <span className="text-[#444444] text-[10px]">{showAnnotations ? '▲' : '▼'}</span>
            </button>
            {showAnnotations && (
              <div className="px-3 pb-3 pt-3 flex flex-col gap-3 border-t border-[#1A1A1A]">
                <SetupTypeInput
                  value={open.setupType}
                  onChange={v => patchOpen({ setupType: v })}
                  inputCls={inputCls} selectCls={selectCls} labelCls={labelCls}
                  idPrefix="open-"
                />
                <EmotionalStateInput
                  value={open.emotionalState}
                  onChange={v => patchOpen({ emotionalState: v })}
                  inputCls={inputCls} selectCls={selectCls} labelCls={labelCls}
                  idPrefix="open-"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="open-stop-price" className={labelCls}>מחיר עצירה</label>
                    <input id="open-stop-price" type="number" step="0.01" value={open.stopPrice ?? ''}
                      onChange={e => {
                        const v = parseFloat(e.target.value)
                        patchOpen({ stopPrice: isNaN(v) ? null : v })
                      }}
                      className={inputCls} placeholder="—" />
                  </div>
                  <div>
                    <label htmlFor="open-target-price" className={labelCls}>מחיר יעד</label>
                    <input id="open-target-price" type="number" step="0.01" value={open.targetPrice ?? ''}
                      onChange={e => {
                        const v = parseFloat(e.target.value)
                        patchOpen({ targetPrice: isNaN(v) ? null : v })
                      }}
                      className={inputCls} placeholder="—" />
                  </div>
                </div>
                <div>
                  <label htmlFor="open-notes" className={labelCls}>הערות</label>
                  <textarea id="open-notes" rows={2} value={open.notes ?? ''}
                    onChange={e => patchOpen({ notes: e.target.value || undefined })}
                    className={inputCls + ' resize-none'} placeholder="…" />
                </div>
                <div>
                  <label htmlFor="open-did-right" className={labelCls}>מה עשיתי נכון</label>
                  <textarea id="open-did-right" rows={2} value={open.didRight ?? ''}
                    onChange={e => patchOpen({ didRight: e.target.value || undefined })}
                    className={inputCls + ' resize-none'} placeholder="…" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Close section ──────────────────────────────────────────── */}
      <div className="bg-[#111111] border border-[#222222] rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-[#0D0D0D] border-b border-[#1A1A1A] text-xs font-mono text-[#FFB800]">
          סגירת הטרייד
        </div>
        <div className="p-4">
          <CloseFieldsInput
            value={close}
            onChange={patchClose}
            hasStop={hasStop}
            hasTarget={hasTarget}
            timezone={timezone}
            inputCls={inputCls} selectCls={selectCls} labelCls={labelCls}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="px-4 py-1.5 bg-[#FFB800] text-black text-sm font-mono font-semibold rounded hover:bg-[#e0a200] disabled:opacity-50 transition-colors mr-auto">
          {submitting ? 'שולח…' : 'שמור טרייד סגור'}
        </button>
      </div>

      {message && (
        <div className={`text-xs font-mono border rounded px-3 py-2 ${
          message.kind === 'ok'
            ? 'text-[#2CC84A] border-[#2CC84A]/30 bg-[#2CC84A]/5'
            : 'text-[#FF4D4D] border-[#FF4D4D]/30 bg-[#FF4D4D]/5'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  )
}
