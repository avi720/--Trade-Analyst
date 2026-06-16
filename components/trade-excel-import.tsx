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

    const buf = await file.arrayBuffer()
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
      const res = await fetch('/api/trades/manual', {
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

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`panel p-10 flex flex-col items-center justify-center gap-2 cursor-pointer border-2 border-dashed transition-colors ${
          dragging ? 'border-amber bg-amber/5' : 'border-border hover:border-shade-2'
        }`}
      >
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
        <span className="text-2xl">📂</span>
        <span className="text-sm text-text-dim font-mono">גרור קובץ Excel לכאן או לחץ לבחירה</span>
        <span className="text-xs text-text-faint font-mono">.xlsx</span>
      </div>

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
                  <th className={thCls}>צד</th>
                  <th className={thCls}>כמות</th>
                  <th className={thCls}>מחיר</th>
                  <th className={thCls}>עמלה</th>
                  <th className={thCls}>מטבע</th>
                  <th className={thCls}>סוג פקודה</th>
                  <th className={thCls}>עצירה</th>
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
