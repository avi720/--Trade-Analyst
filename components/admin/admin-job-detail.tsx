'use client'

import { useEffect, useRef, useState } from 'react'
import { X, RotateCcw, Trash2, Loader2 } from 'lucide-react'
import type { AdminJobRow } from './admin-jobs-table'

interface Props {
  jobId: string
  summary: AdminJobRow
  onClose: () => void
  onReset: () => Promise<void>
  onDelete: () => Promise<void>
}

interface JobDetail {
  id: string
  userId: string
  userEmail: string | null
  status: string
  originalFilename: string
  fileSize: number
  sourceTimezone: string
  storagePath: string | null
  rowCountRaw: number | null
  aiMapping: unknown
  extractedLegs: unknown
  parseErrors: unknown
  importSummary: unknown
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

function pretty(value: unknown): string {
  if (value == null) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function AdminJobDetail({
  jobId,
  summary,
  onClose,
  onReset,
  onDelete,
}: Props) {
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/jobs/${jobId}`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(
            (j as { error?: string }).error ?? `HTTP ${r.status}`,
          )
        }
        return r.json() as Promise<JobDetail>
      })
      .then(json => {
        if (!cancelled) setDetail(json)
      })
      .catch(e => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'טעינת פרטי משימה נכשלה')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [jobId])

  // Autofocus the close button so ESC works right away without a stray click.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // ESC to dismiss.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`פרטי משימה ${summary.originalFilename}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-panel border border-border rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="min-w-0">
            <h2
              id="admin-job-detail-title"
              className="text-base font-semibold text-text-main truncate"
              title={summary.originalFilename}
            >
              {summary.originalFilename}
            </h2>
            <p className="text-xs text-text-dim font-mono truncate">
              {summary.userEmail} · {summary.id}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="rounded-md p-1.5 text-text-dim hover:text-text-main hover:bg-panel-3"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-text-dim">
              <Loader2 size={14} className="animate-spin" />
              טוען פרטים…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red/30 bg-red/10 p-3 text-sm text-red">
              {error}
            </div>
          )}

          {detail && (
            <>
              <section>
                <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2">
                  Metadata
                </h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <dt className="text-text-dim">סטטוס</dt>
                  <dd className="text-text-main">{detail.status}</dd>
                  <dt className="text-text-dim">גודל</dt>
                  <dd className="text-text-main font-mono">
                    {(detail.fileSize / 1024).toFixed(1)} KB
                  </dd>
                  <dt className="text-text-dim">אזור זמן במקור</dt>
                  <dd className="text-text-main font-mono">{detail.sourceTimezone}</dd>
                  <dt className="text-text-dim">שורות במקור (raw)</dt>
                  <dd className="text-text-main font-mono">
                    {detail.rowCountRaw ?? '—'}
                  </dd>
                  <dt className="text-text-dim">נוצר</dt>
                  <dd className="text-text-main font-mono">{detail.createdAt}</dd>
                  <dt className="text-text-dim">עודכן</dt>
                  <dd className="text-text-main font-mono">{detail.updatedAt}</dd>
                  <dt className="text-text-dim">הושלם</dt>
                  <dd className="text-text-main font-mono">
                    {detail.completedAt ?? '—'}
                  </dd>
                  <dt className="text-text-dim">Storage path</dt>
                  <dd className="text-text-main font-mono truncate" title={detail.storagePath ?? ''}>
                    {detail.storagePath ?? '—'}
                  </dd>
                </dl>
              </section>

              {detail.errorMessage && (
                <section>
                  <h3 className="text-xs font-semibold text-red uppercase tracking-wider mb-2">
                    Error
                  </h3>
                  <p className="text-sm text-red font-mono whitespace-pre-wrap">
                    {detail.errorMessage}
                  </p>
                </section>
              )}

              <JsonBlock title="aiMapping" value={detail.aiMapping} />
              <JsonBlock
                title="extractedLegs (first 20)"
                value={
                  Array.isArray(detail.extractedLegs)
                    ? (detail.extractedLegs as unknown[]).slice(0, 20)
                    : detail.extractedLegs
                }
              />
              <JsonBlock title="parseErrors" value={detail.parseErrors} />
              <JsonBlock title="importSummary" value={detail.importSummary} />
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-text-main hover:border-amber hover:text-amber"
          >
            <RotateCcw size={12} aria-hidden="true" />
            אפס משימה
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-text-main hover:border-red hover:text-red"
          >
            <Trash2 size={12} aria-hidden="true" />
            מחק משימה
          </button>
        </footer>
      </div>
    </div>
  )
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2">
        {title}
      </h3>
      <pre className="bg-input-bg border border-border rounded-md p-3 text-xs font-mono text-text-main overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
        {pretty(value)}
      </pre>
    </section>
  )
}
