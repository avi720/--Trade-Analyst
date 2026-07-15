'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { manualLegSchema, type ManualLeg } from '@/lib/trade/manual-entry'
import { TRADE_TIMEZONES } from '@/lib/trade/tz'
import { CURRENCIES } from '@/lib/constants/trade-options'
import { trackEvent } from '@/lib/analytics/posthog'

// ─── Shapes mirroring the API ─────────────────────────────────────────────

interface LegError {
  rowIndex: number
  reason: string
}
interface ImportSummary {
  processed: number
  skipped: number
  failed: number
  errors: string[]
}
interface AiMappingSummary {
  mode?: 'mapping' | 'extraction'
  confidence?: number
  notes?: string
}
interface JobItem {
  id: string
  status: string
  originalFilename: string
  fileSize: number
  sourceTimezone: string
  rowCountRaw: number | null
  aiMapping: AiMappingSummary | null
  parseErrors: LegError[] | null
  importSummary: ImportSummary | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}
interface JobDetail extends JobItem {
  extractedLegs: ManualLeg[] | null
}

const ACTIVE_STATUSES = new Set(['PENDING', 'PARSING', 'AI_MAPPING', 'IMPORTING'])
const POLL_MS = 5000

// Friendly Hebrew for the worker's machine error codes.
const ERROR_LABELS: Record<string, string> = {
  row_cap_exceeded: 'הקובץ גדול מדי (מעל 2000 שורות)',
  empty_workbook: 'הקובץ ריק או ללא נתונים',
  timeout_watchdog: 'העיבוד ארך יותר מדי — נסה שוב',
  signed_url_failed: 'שגיאת גישה לקובץ',
  ai_extract_failed: 'מנוע ה-AI לא הצליח לנתח את הקובץ — נסה שוב',
}
function errorLabel(code: string | null): string {
  if (!code) return 'העיבוד נכשל'
  return ERROR_LABELS[code] ?? code
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'בתור…', cls: 'text-amber border-amber/30 bg-amber/5' },
  PARSING: { label: 'קורא קובץ…', cls: 'text-amber border-amber/30 bg-amber/5' },
  AI_MAPPING: { label: 'מנתח עם AI…', cls: 'text-amber border-amber/30 bg-amber/5' },
  AWAITING_CONFIRMATION: { label: 'ממתין לאישור', cls: 'text-green border-green/30 bg-green/5' },
  IMPORTING: { label: 'מייבא…', cls: 'text-amber border-amber/30 bg-amber/5' },
  COMPLETED: { label: 'הושלם', cls: 'text-green border-green/30 bg-green/5' },
  FAILED: { label: 'נכשל', cls: 'text-red border-red/30 bg-red/5' },
  CANCELLED: { label: 'בוטל', cls: 'text-text-dim border-border bg-transparent' },
}

const MAX_UPLOAD_MB = 5

// ─── Component ────────────────────────────────────────────────────────────

export function TradeAiImport({ defaultTimezone }: { defaultTimezone: string }) {
  const [jobs, setJobs] = useState<JobItem[]>([])
  const [timezone, setTimezone] = useState(defaultTimezone)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [notice, setNotice] = useState('')

  // Preview state
  const [previewJob, setPreviewJob] = useState<JobDetail | null>(null)
  const [editLegs, setEditLegs] = useState<ManualLeg[]>([])
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<ImportSummary | null>(null)

  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default')
  const prevStatuses = useRef<Map<string, string>>(new Map())

  // ── Jobs fetching + polling ──────────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/trades/ai-import')
      if (!res.ok) return
      const json = await res.json()
      const next: JobItem[] = json.jobs ?? []

      // Fire a browser notification when a job newly reaches AWAITING_CONFIRMATION.
      for (const j of next) {
        const prev = prevStatuses.current.get(j.id)
        if (
          prev &&
          prev !== 'AWAITING_CONFIRMATION' &&
          j.status === 'AWAITING_CONFIRMATION' &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          new Notification('הקובץ שלך מוכן לאישור', {
            body: j.originalFilename,
            tag: j.id,
          })
        }
      }
      prevStatuses.current = new Map(next.map((j) => [j.id, j.status]))
      setJobs(next)
    } catch {
      /* transient — next poll retries */
    }
  }, [])

  useEffect(() => {
    if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission)
    loadJobs()
  }, [loadJobs])

  const hasActive = jobs.some((j) => ACTIVE_STATUSES.has(j.status))
  useEffect(() => {
    if (!hasActive) return
    const id = setInterval(loadJobs, POLL_MS)
    return () => clearInterval(id)
  }, [hasActive, loadJobs])

  // ── Upload ───────────────────────────────────────────────────────────────
  function pickFile(f: File) {
    setUploadError('')
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setUploadError('רק קבצי .xlsx נתמכים')
      return
    }
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`הקובץ גדול מדי — עד ${MAX_UPLOAD_MB} MB`)
      return
    }
    setFile(f)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadError('')
    setNotice('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('timezone', timezone)
      const res = await fetch('/api/trades/ai-import', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        setUploadError(json.error ?? 'ההעלאה נכשלה')
        return
      }
      trackEvent('ai_import_uploaded', { timezone })
      setFile(null)
      setNotice('הקובץ הועלה. הניתוח יתחיל תוך דקה או שתיים — אפשר להמשיך לעבוד על משהו אחר.')
      await loadJobs()
    } catch {
      setUploadError('שגיאת רשת')
    } finally {
      setUploading(false)
    }
  }

  async function requestNotifications() {
    if (typeof Notification === 'undefined') return
    const perm = await Notification.requestPermission()
    setNotifPerm(perm)
  }

  // ── Job actions ──────────────────────────────────────────────────────────
  async function openPreview(jobId: string) {
    setConfirmResult(null)
    try {
      const res = await fetch(`/api/trades/ai-import/${jobId}`)
      if (!res.ok) return
      const detail: JobDetail = await res.json()
      setPreviewJob(detail)
      setEditLegs(detail.extractedLegs ?? [])
      if (detail.aiMapping?.mode) trackEvent('ai_import_mapped', { mode: detail.aiMapping.mode })
    } catch {
      /* ignore */
    }
  }

  async function cancelJob(jobId: string) {
    await fetch(`/api/trades/ai-import/${jobId}`, { method: 'DELETE' })
    if (previewJob?.id === jobId) setPreviewJob(null)
    await loadJobs()
  }

  async function handleConfirm() {
    if (!previewJob) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/trades/ai-import/${previewJob.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legs: editLegs }),
      })
      const json = await res.json()
      if (!res.ok) {
        setUploadError(json.error ?? 'האישור נכשל')
        setPreviewJob(null)
        await loadJobs()
        return
      }
      setConfirmResult(json)
      trackEvent('ai_import_confirmed', { count: json.processed })
      if (json.processed > 0) trackEvent('first_trade_imported', { source: 'ai', count: json.processed })
      setPreviewJob(null)
      await loadJobs()
    } catch {
      setUploadError('שגיאת רשת')
    } finally {
      setConfirming(false)
    }
  }

  // ── Preview editing ──────────────────────────────────────────────────────
  const legErrors = editLegs.map((leg) => {
    const parsed = manualLegSchema.safeParse(leg)
    return parsed.success ? null : parsed.error.issues[0]?.message ?? 'שגיאה'
  })
  const hasLegErrors = legErrors.some((e) => e !== null)

  function updateLeg(i: number, patch: Partial<ManualLeg>) {
    setEditLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function deleteLeg(i: number) {
    setEditLegs((prev) => prev.filter((_, idx) => idx !== i))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (previewJob) {
    return (
      <PreviewEditor
        job={previewJob}
        legs={editLegs}
        legErrors={legErrors}
        hasLegErrors={hasLegErrors}
        confirming={confirming}
        onUpdate={updateLeg}
        onDelete={deleteLeg}
        onConfirm={handleConfirm}
        onCancel={() => setPreviewJob(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <JobsPanel jobs={jobs} onOpen={openPreview} onCancel={cancelJob} />

      {confirmResult && <ResultBanner result={confirmResult} />}

      {notifPerm === 'default' && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-panel px-3 py-2 text-sm">
          <span className="text-text-dim font-mono">
            אפשר התראות דפדפן כדי לדעת מיד כשהניתוח מוכן
          </span>
          <button
            onClick={requestNotifications}
            className="text-xs font-medium text-amber hover:underline"
          >
            אפשר התראות
          </button>
        </div>
      )}

      {/* Upload */}
      <div className="panel p-4 flex flex-col gap-4">
        <div>
          <p className="text-sm text-text-main font-mono">העלאת Excel אישי</p>
          <p className="text-sm text-text-dim mt-0.5">
            כל פורמט — כותרות שונות, תאים ממוזגים, טבלאות מרובות. ה-AI יזהה ויחלץ.
          </p>
        </div>

        {/* Timezone — required */}
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-tz" className="text-xs font-mono text-text-dim">
            אזור הזמן של הקובץ <span className="text-red">*</span>
          </label>
          <select
            id="ai-tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="bg-input-bg border border-border rounded px-3 py-2 text-sm font-mono text-text-main focus:outline focus:outline-2 focus:outline-amber"
          >
            {TRADE_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-faint font-mono">
            Excel לא שומר אזור זמן — בחירה שגויה תזיז את שעות הטריידים.
          </span>
        </div>

        {/* Dropzone */}
        <label
          htmlFor="ai-file-input"
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) pickFile(f)
          }}
          className={`p-8 flex flex-col items-center justify-center gap-2 cursor-pointer border-2 border-dashed rounded transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-amber ${
            dragging ? 'border-amber bg-amber/5' : 'border-border hover:border-shade-2'
          }`}
        >
          <input
            id="ai-file-input"
            type="file"
            accept=".xlsx"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) pickFile(f)
              e.target.value = ''
            }}
          />
          <span aria-hidden="true" className="text-2xl">🤖</span>
          <span className="text-sm text-text-dim font-mono">
            {file ? file.name : 'גרור קובץ Excel לכאן או לחץ לבחירה'}
          </span>
          <span className="text-xs text-text-faint font-mono">.xlsx · עד {MAX_UPLOAD_MB}MB</span>
        </label>

        {uploadError && (
          <div className="text-xs text-red font-mono border border-red/20 bg-red/5 rounded px-3 py-2">
            {uploadError}
          </div>
        )}
        {notice && (
          <div className="text-xs text-green font-mono border border-green/20 bg-green/5 rounded px-3 py-2">
            {notice}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="self-start px-4 py-2 bg-amber text-black text-sm font-mono font-semibold rounded hover:bg-amber-dark disabled:opacity-50 transition-colors"
        >
          {uploading ? 'מעלה…' : 'העלה לניתוח AI'}
        </button>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function JobsPanel({
  jobs,
  onOpen,
  onCancel,
}: {
  jobs: JobItem[]
  onOpen: (id: string) => void
  onCancel: (id: string) => void
}) {
  if (jobs.length === 0) return null
  return (
    <div className="panel p-4 flex flex-col gap-2">
      <h3 className="text-sm font-mono text-text-main">העלאות AI אחרונות</h3>
      <ul className="flex flex-col divide-y divide-input-bg">
        {jobs.map((j) => {
          const meta = STATUS_META[j.status] ?? { label: j.status, cls: 'text-text-dim border-border' }
          return (
            <li key={j.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-mono text-text-main truncate">{j.originalFilename}</span>
                <span className="text-xs font-mono text-text-faint">
                  {new Date(j.createdAt).toLocaleString('he-IL')} · {j.sourceTimezone}
                  {j.status === 'COMPLETED' && j.importSummary
                    ? ` · ${j.importSummary.processed} יובאו`
                    : ''}
                  {j.status === 'FAILED' ? ` · ${errorLabel(j.errorMessage)}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-mono rounded-full border px-2 py-0.5 ${meta.cls}`}>
                  {meta.label}
                </span>
                {j.status === 'AWAITING_CONFIRMATION' && (
                  <button
                    onClick={() => onOpen(j.id)}
                    className="text-xs font-mono font-semibold text-amber hover:underline"
                  >
                    פתח תצוגה
                  </button>
                )}
                {(ACTIVE_STATUSES.has(j.status) || j.status === 'AWAITING_CONFIRMATION') && (
                  <button
                    onClick={() => onCancel(j.id)}
                    className="text-xs font-mono text-text-dim hover:text-red"
                  >
                    בטל
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ResultBanner({ result }: { result: ImportSummary }) {
  return (
    <div className="panel p-4 text-xs font-mono flex flex-col gap-1">
      <span className="text-green">✓ עובדו: {result.processed}</span>
      {result.skipped > 0 && <span className="text-text-dim">כפולים שנדחו: {result.skipped}</span>}
      {result.failed > 0 && <span className="text-red">נכשלו: {result.failed}</span>}
      {result.errors.map((e, i) => (
        <span key={i} className="text-red">
          {e}
        </span>
      ))}
      <a href="/search" className="text-amber hover:underline mt-1">
        צפה בטריידים ←
      </a>
    </div>
  )
}

const inputCls =
  'w-full bg-input-bg border border-border rounded px-1.5 py-1 text-xs font-mono text-text-main focus:outline focus:outline-1 focus:outline-amber'

function PreviewEditor({
  job,
  legs,
  legErrors,
  hasLegErrors,
  confirming,
  onUpdate,
  onDelete,
  onConfirm,
  onCancel,
}: {
  job: JobDetail
  legs: ManualLeg[]
  legErrors: (string | null)[]
  hasLegErrors: boolean
  confirming: boolean
  onUpdate: (i: number, patch: Partial<ManualLeg>) => void
  onDelete: (i: number) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const mode = job.aiMapping?.mode
  const confidence = job.aiMapping?.confidence
  const th = 'text-right text-[11px] font-mono text-text-dim px-1.5 py-1 whitespace-nowrap'

  return (
    <div className="flex flex-col gap-3">
      {/* Banner */}
      <div className="panel p-3 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-mono text-text-main">{job.originalFilename}</span>
          <span className="text-xs font-mono text-text-dim">
            אזור זמן: {job.sourceTimezone}
          </span>
        </div>
        <span className="text-xs font-mono text-text-dim">
          {mode === 'extraction' ? 'זוהתה פריסה מורכבת' : 'זוהתה טבלה שטוחה'}
          {confidence != null ? ` · ודאות ${Math.round(confidence * 100)}%` : ''}
          {` · ${legs.length} טריידים`}
        </span>
        {job.aiMapping?.notes && (
          <span className="text-xs font-mono text-text-faint">{job.aiMapping.notes}</span>
        )}
      </div>

      {job.parseErrors && job.parseErrors.length > 0 && (
        <div className="text-xs font-mono text-amber border border-amber/20 bg-amber/5 rounded px-3 py-2 flex flex-col gap-1">
          <span className="font-semibold">{job.parseErrors.length} שורות לא נותחו והושמטו:</span>
          {job.parseErrors.slice(0, 8).map((e, i) => (
            <span key={i}>
              שורה {e.rowIndex + 1}: {e.reason}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto max-h-[28rem] panel p-2">
        <table className="w-full">
          <thead className="sticky top-0 bg-panel">
            <tr className="border-b border-border">
              <th className={th}>#</th>
              <th className={th}>טיקר</th>
              <th className={th}>תאריך</th>
              <th className={th}>שעה</th>
              <th className={th}>כיוון</th>
              <th className={th}>כמות</th>
              <th className={th}>מחיר</th>
              <th className={th}>עמלה</th>
              <th className={th}>מטבע</th>
              <th className={th}>סטופ</th>
              <th className={th}>יעד</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg, i) => (
              <tr
                key={i}
                className={`border-b border-input-bg ${legErrors[i] ? 'bg-red/5' : ''}`}
              >
                <td className="px-1.5 py-1 text-[11px] font-mono text-text-faint">{i + 1}</td>
                <td className="px-1 py-1 w-20">
                  <input
                    className={inputCls}
                    value={leg.ticker}
                    onChange={(e) => onUpdate(i, { ticker: e.target.value.toUpperCase() })}
                  />
                </td>
                <td className="px-1 py-1 w-28">
                  <input
                    className={inputCls}
                    value={leg.date}
                    onChange={(e) => onUpdate(i, { date: e.target.value })}
                  />
                </td>
                <td className="px-1 py-1 w-16">
                  <input
                    className={inputCls}
                    value={leg.time}
                    onChange={(e) => onUpdate(i, { time: e.target.value })}
                  />
                </td>
                <td className="px-1 py-1 w-20">
                  <select
                    className={inputCls}
                    value={leg.side}
                    onChange={(e) => onUpdate(i, { side: e.target.value as 'BUY' | 'SELL' })}
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </td>
                <td className="px-1 py-1 w-20">
                  <input
                    className={inputCls}
                    type="number"
                    value={leg.quantity}
                    onChange={(e) => onUpdate(i, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td className="px-1 py-1 w-24">
                  <input
                    className={inputCls}
                    type="number"
                    value={leg.price}
                    onChange={(e) => onUpdate(i, { price: Number(e.target.value) })}
                  />
                </td>
                <td className="px-1 py-1 w-20">
                  <input
                    className={inputCls}
                    type="number"
                    value={leg.commission}
                    onChange={(e) => onUpdate(i, { commission: Number(e.target.value) })}
                  />
                </td>
                <td className="px-1 py-1 w-20">
                  <select
                    className={inputCls}
                    value={leg.currency}
                    onChange={(e) => onUpdate(i, { currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1 w-20">
                  <input
                    className={inputCls}
                    type="number"
                    value={leg.stopPrice ?? ''}
                    onChange={(e) =>
                      onUpdate(i, { stopPrice: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </td>
                <td className="px-1 py-1 w-20">
                  <input
                    className={inputCls}
                    type="number"
                    value={leg.targetPrice ?? ''}
                    onChange={(e) =>
                      onUpdate(i, { targetPrice: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </td>
                <td className="px-1 py-1">
                  <button
                    onClick={() => onDelete(i)}
                    className="text-xs font-mono text-text-dim hover:text-red"
                    aria-label={`מחק שורה ${i + 1}`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasLegErrors && (
        <div className="text-xs text-red font-mono border border-red/20 bg-red/5 rounded px-3 py-2">
          יש שורות עם שגיאות (מסומנות באדום) — תקן או מחק אותן לפני האישור.
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-sm font-mono text-text-dim hover:text-text-main border border-border rounded px-3 py-1.5 transition-colors"
        >
          חזור
        </button>
        <button
          onClick={onConfirm}
          disabled={confirming || hasLegErrors || legs.length === 0}
          className="px-4 py-1.5 bg-amber text-black text-xs font-mono font-semibold rounded hover:bg-amber-dark disabled:opacity-50 transition-colors"
        >
          {confirming ? 'מייבא…' : `אשר וייבא ${legs.length} טריידים`}
        </button>
      </div>
    </div>
  )
}
