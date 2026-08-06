'use client'

import { useState, useRef } from 'react'
import type { ManualLeg } from '@/lib/trade/manual-entry'

interface Preview {
  legs: ManualLeg[]
  warnings: string[]
}

interface Result {
  processed: number
  skipped: number
  failed: number
  errors: string[]
}

export function TradeExcelImport() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [parseError, setParseError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [dragging, setDragging] = useState(false)

  async function processFile(file: File) {
    setParseError('')
    setPreview(null)
    setResult(null)

    // Parse client-side for preview using the import endpoint's preview mode
    const form = new FormData()
    form.append('file', file)
    form.append('previewOnly', 'true')

    try {
      const res = await fetch('/api/trades/import', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || json.error) {
        setParseError(json.error ?? 'שגיאה בניתוח הקובץ')
        return
      }
      setPreview({ legs: json.legs, warnings: json.warnings ?? [] })
    } catch {
      setParseError('שגיאת רשת')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  async function handleConfirm() {
    if (!preview) return
    setSubmitting(true)
    setResult(null)
    try {
      // Not /api/trades/manual — that endpoint belongs to the manual-entry tab
      // and only accepts legs that OPEN a position. A spreadsheet carries
      // closing rows by design, so the import commits through its own route.
      const res = await fetch('/api/trades/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legs: preview.legs }),
      })
      const json = await res.json()
      if (!res.ok) {
        setParseError(json.error ?? 'שגיאה')
        return
      }
      setResult(json)
      if (json.processed > 0) {
        const { trackEvent } = await import('@/lib/analytics/posthog')
        trackEvent('first_trade_imported', { source: 'excel', count: json.processed })
      }
      setPreview(null)
    } catch {
      setParseError('שגיאת רשת')
    } finally {
      setSubmitting(false)
    }
  }

  function downloadTemplate() {
    window.location.href = '/api/trades/import?template=true'
  }

  const thCls = 'text-right text-sm font-mono text-text-dim px-2 py-1'
  const tdCls = 'text-right text-sm font-mono text-text-dim px-2 py-1'

  return (
    <div className="flex flex-col gap-4">
      {/* Template download */}
      <div className="panel p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-text-main font-mono">תבנית Excel</p>
          <p className="text-sm text-text-dim mt-0.5">הורד → מלא → העלה</p>
        </div>
        <button
          onClick={downloadTemplate}
          className="px-3 py-1.5 border border-shade text-text-dim text-sm font-mono rounded hover:text-amber hover:border-amber transition-colors"
        >
          ⬇ הורד תבנית
        </button>
      </div>

      <ImportFormatExplainer />

      {/* Drop zone — <label> wraps a visually-hidden but focusable file input so
          keyboard users can Tab to the input and press Enter to open the picker. */}
      <label
        htmlFor="excel-file-input"
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`panel p-10 flex flex-col items-center justify-center gap-2 cursor-pointer border-2 border-dashed transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-amber focus-within:outline-offset-2 ${
          dragging ? 'border-amber bg-amber/5' : 'border-border hover:border-shade-2'
        }`}
      >
        <input
          ref={fileRef}
          id="excel-file-input"
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={handleFileChange}
          aria-describedby="excel-dropzone-hint"
        />
        <span aria-hidden="true" className="text-2xl">📂</span>
        <span className="text-sm text-text-dim font-mono">גרור קובץ Excel לכאן או לחץ לבחירה</span>
        <span id="excel-dropzone-hint" className="text-xs text-text-faint font-mono">.xlsx</span>
      </label>

      {parseError && (
        <div className="text-xs text-red font-mono border border-red/20 bg-red/5 rounded px-3 py-2">
          {parseError}
        </div>
      )}

      {/* Preview table */}
      {preview && (
        <div className="panel p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono text-text-main">תצוגה מקדימה — {preview.legs.length} שורות</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setPreview(null)}
                className="text-sm font-mono text-text-dim hover:text-text-main border border-border rounded px-3 py-1 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting || preview.legs.length === 0}
                className="px-4 py-1 bg-amber text-black text-xs font-mono font-semibold rounded hover:bg-amber-dark disabled:opacity-50 transition-colors"
              >
                {submitting ? 'מעבד…' : 'אשר ויבא'}
              </button>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="text-xs font-mono text-amber border border-amber/20 bg-amber/5 rounded px-3 py-2 flex flex-col gap-1">
              {preview.warnings.map((w, i) => <span key={i}>{w}</span>)}
            </div>
          )}

          <div className="overflow-x-auto max-h-72">
            <table className="w-full">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-border">
                  <th className={thCls}>#</th>
                  <th className={thCls}>טיקר</th>
                  <th className={thCls}>תאריך</th>
                  <th className={thCls}>שעה</th>
                  <th className={thCls}>כיוון</th>
                  <th className={thCls}>כמות</th>
                  <th className={thCls}>מחיר</th>
                  <th className={thCls}>עמלה</th>
                  <th className={thCls}>מטבע</th>
                  <th className={thCls}>סוג פקודה</th>
                  <th className={thCls}>סטופ</th>
                  <th className={thCls}>יעד</th>
                </tr>
              </thead>
              <tbody>
                {preview.legs.map((leg, i) => (
                  <tr key={i} className="border-b border-input-bg">
                    <td className={tdCls}>{i + 1}</td>
                    <td className="px-2 py-1 text-xs font-mono font-semibold text-text-main">{leg.ticker}</td>
                    <td className={tdCls}>{leg.date}</td>
                    <td className={tdCls}>{leg.time}</td>
                    <td className={`px-2 py-1 text-xs font-mono ${leg.side === 'BUY' ? 'text-green' : 'text-red'}`}>{leg.side}</td>
                    <td className={tdCls}>{leg.quantity}</td>
                    <td className={tdCls}>{leg.price.toFixed(2)}</td>
                    <td className={tdCls}>{leg.commission.toFixed(2)}</td>
                    <td className={tdCls}>{leg.currency}</td>
                    <td className={tdCls}>{leg.orderType ?? '—'}</td>
                    <td className={tdCls}>{leg.stopPrice != null ? leg.stopPrice : '—'}</td>
                    <td className={tdCls}>{leg.targetPrice != null ? leg.targetPrice : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="panel p-4 text-xs font-mono flex flex-col gap-1">
          <span className="text-green">✓ עובדו: {result.processed}</span>
          {result.skipped > 0 && <span className="text-text-dim">כפולים שנדחו: {result.skipped}</span>}
          {result.failed > 0 && <span className="text-red">נכשלו: {result.failed}</span>}
          {result.errors.map((e, i) => <span key={i} className="text-red">{e}</span>)}
        </div>
      )}
    </div>
  )
}

/**
 * How to lay out the spreadsheet. Worth spelling out: unlike the manual-entry
 * tab, which opens positions only, the import expects the closing rows too —
 * that is the whole reason a broker's execution log imports cleanly here.
 */
function ImportFormatExplainer() {
  const [open, setOpen] = useState(false)

  return (
    <div className="panel">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-mono text-text-dim hover:text-text-main transition-colors"
      >
        <span>
          <span aria-hidden="true" className="text-amber">ⓘ</span> איך לכתוב את הנתונים בקובץ?
        </span>
        <span aria-hidden="true" className="text-text-faint text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-input-bg flex flex-col gap-3 text-sm text-text-dim leading-relaxed">
          <p>
            <span className="text-text-main font-mono">שורה אחת = ביצוע אחד.</span>{' '}
            לא שורה אחת לכל טרייד — שורה לכל פעולה שביצעת בפועל אצל הברוקר.
            עמודת <span className="font-mono text-amber">side</span> היא הכיוון של אותו ביצוע:{' '}
            <span className="font-mono text-green">BUY</span> לקנייה,{' '}
            <span className="font-mono text-red">SELL</span> למכירה.
          </p>

          <p>
            <span className="text-text-main font-mono">לכל שורת קנייה צריכה להיות שורת מכירה</span>{' '}
            — אם הטרייד אכן נסגר. בלי שורת הסגירה הטרייד יישאר פתוח במערכת. אם הפוזיציה
            עדיין פתוחה במציאות, פשוט אל תכתוב שורת סגירה.
          </p>

          <div className="overflow-x-auto">
            <table className="text-xs font-mono border border-input-bg rounded">
              <thead>
                <tr className="border-b border-input-bg bg-panel-2">
                  <th className="px-2 py-1 text-right text-text-dim">date</th>
                  <th className="px-2 py-1 text-right text-text-dim">ticker</th>
                  <th className="px-2 py-1 text-right text-text-dim">side</th>
                  <th className="px-2 py-1 text-right text-text-dim">quantity</th>
                  <th className="px-2 py-1 text-right text-text-dim">price</th>
                  <th className="px-2 py-1 text-right text-text-dim">מה זה עושה</th>
                </tr>
              </thead>
              <tbody className="text-text-main">
                <tr className="border-b border-input-bg">
                  <td className="px-2 py-1">2026-01-15</td>
                  <td className="px-2 py-1">AAPL</td>
                  <td className="px-2 py-1 text-green">BUY</td>
                  <td className="px-2 py-1">100</td>
                  <td className="px-2 py-1">150.00</td>
                  <td className="px-2 py-1 text-text-dim">פותח פוזיציה</td>
                </tr>
                <tr className="border-b border-input-bg">
                  <td className="px-2 py-1">2026-01-16</td>
                  <td className="px-2 py-1">AAPL</td>
                  <td className="px-2 py-1 text-green">BUY</td>
                  <td className="px-2 py-1">50</td>
                  <td className="px-2 py-1">152.00</td>
                  <td className="px-2 py-1 text-text-dim">מוסיף לפוזיציה (150 יחידות)</td>
                </tr>
                <tr className="border-b border-input-bg">
                  <td className="px-2 py-1">2026-01-18</td>
                  <td className="px-2 py-1">AAPL</td>
                  <td className="px-2 py-1 text-red">SELL</td>
                  <td className="px-2 py-1">60</td>
                  <td className="px-2 py-1">158.00</td>
                  <td className="px-2 py-1 text-text-dim">מוכר חלק (נשארות 90)</td>
                </tr>
                <tr>
                  <td className="px-2 py-1">2026-01-20</td>
                  <td className="px-2 py-1">AAPL</td>
                  <td className="px-2 py-1 text-red">SELL</td>
                  <td className="px-2 py-1">90</td>
                  <td className="px-2 py-1">161.00</td>
                  <td className="px-2 py-1 text-text-dim">סוגר את הטרייד</td>
                </tr>
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-1.5 list-disc ps-5">
            <li>סדר השורות לפי תאריך ושעה. המערכת מחשבת FIFO לפי הסדר הזה.</li>
            <li>מכירה בכמות גדולה מהפתוח הופכת את הפוזיציה לכיוון ההפוך — ודא שהכמויות נכונות.</li>
            <li>טיקר ללא שורת קנייה שקודמת למכירה ייפתח כפוזיציית שורט.</li>
            <li>שעה ריקה נחשבת כתחילת היום; העמודות האופציונליות (סטופ, יעד, סטאפ, הערות) מתייחסות לטרייד כולו.</li>
            <li>
              <span className="text-text-main">שים לב:</span> טאב{' '}
              <span className="font-mono">״טרייד פתוח״</span> מיועד לפתיחת פוזיציה בלבד ולכן
              דוחה שורות סגירה — הכלל הזה לא חל כאן. בייבוא Excel שורות הסגירה נחוצות.
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
