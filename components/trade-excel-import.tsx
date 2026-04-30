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

  const thCls = 'text-right text-xs font-mono text-[#555555] px-2 py-1'
  const tdCls = 'text-right text-xs font-mono text-[#888888] px-2 py-1'

  return (
    <div className="flex flex-col gap-4">
      {/* Template download */}
      <div className="panel p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-[#E0E0E0] font-mono">תבנית Excel</p>
          <p className="text-xs text-[#555555] mt-0.5">הורד → מלא → העלה</p>
        </div>
        <button
          onClick={downloadTemplate}
          className="px-3 py-1.5 border border-[#333333] text-[#888888] text-xs font-mono rounded hover:text-[#FFB800] hover:border-[#FFB800] transition-colors"
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
          dragging ? 'border-[#FFB800] bg-[#FFB800]/5' : 'border-[#222222] hover:border-[#444444]'
        }`}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
        <span className="text-2xl">📂</span>
        <span className="text-sm text-[#888888] font-mono">גרור קובץ Excel לכאן או לחץ לבחירה</span>
        <span className="text-xs text-[#444444] font-mono">.xlsx · .xls · .csv</span>
      </div>

      {parseError && (
        <div className="text-xs text-[#FF4D4D] font-mono border border-[#FF4D4D]/20 bg-[#FF4D4D]/5 rounded px-3 py-2">
          {parseError}
        </div>
      )}

      {/* Preview table */}
      {preview && (
        <div className="panel p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono text-[#E0E0E0]">תצוגה מקדימה — {preview.legs.length} שורות</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setPreview(null)}
                className="text-xs font-mono text-[#888888] hover:text-[#E0E0E0] border border-[#222222] rounded px-3 py-1 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting || preview.legs.length === 0}
                className="px-4 py-1 bg-[#FFB800] text-black text-xs font-mono font-semibold rounded hover:bg-[#e0a200] disabled:opacity-50 transition-colors"
              >
                {submitting ? 'מעבד…' : 'אשר ויבא'}
              </button>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="text-xs font-mono text-[#FFB800] border border-[#FFB800]/20 bg-[#FFB800]/5 rounded px-3 py-2 flex flex-col gap-1">
              {preview.warnings.map((w, i) => <span key={i}>{w}</span>)}
            </div>
          )}

          <div className="overflow-x-auto max-h-72">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#111111]">
                <tr className="border-b border-[#222222]">
                  <th className={thCls}>#</th>
                  <th className={thCls}>טיקר</th>
                  <th className={thCls}>תאריך</th>
                  <th className={thCls}>שעה</th>
                  <th className={thCls}>צד</th>
                  <th className={thCls}>כמות</th>
                  <th className={thCls}>מחיר</th>
                  <th className={thCls}>עמ׳</th>
                  <th className={thCls}>מטבע</th>
                </tr>
              </thead>
              <tbody>
                {preview.legs.map((leg, i) => (
                  <tr key={i} className="border-b border-[#1A1A1A]">
                    <td className={tdCls}>{i + 1}</td>
                    <td className="px-2 py-1 text-xs font-mono font-semibold text-[#E0E0E0]">{leg.ticker}</td>
                    <td className={tdCls}>{leg.date}</td>
                    <td className={tdCls}>{leg.time}</td>
                    <td className={`px-2 py-1 text-xs font-mono ${leg.side === 'BUY' ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}`}>{leg.side}</td>
                    <td className={tdCls}>{leg.quantity}</td>
                    <td className={tdCls}>${leg.price.toFixed(2)}</td>
                    <td className={tdCls}>${leg.commission.toFixed(2)}</td>
                    <td className={tdCls}>{leg.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="panel p-4 text-xs font-mono flex flex-col gap-1">
          <span className="text-[#2CC84A]">✓ עובדו: {result.processed}</span>
          {result.skipped > 0 && <span className="text-[#888888]">כפולים שנדחו: {result.skipped}</span>}
          {result.failed > 0 && <span className="text-[#FF4D4D]">נכשלו: {result.failed}</span>}
          {result.errors.map((e, i) => <span key={i} className="text-[#FF4D4D]">{e}</span>)}
        </div>
      )}
    </div>
  )
}
