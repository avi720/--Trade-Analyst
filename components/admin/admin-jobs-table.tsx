'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { Loader2, RotateCcw, Trash2, Eye } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AdminJobDetail } from './admin-job-detail'

export interface AdminJobRow {
  id: string
  userId: string
  userEmail: string
  status: string
  originalFilename: string
  fileSize: number
  sourceTimezone: string
  rowCountRaw: number | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

interface Props {
  initialRows: AdminJobRow[]
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-panel-3 text-text-dim',
  PARSING: 'bg-amber-tint text-amber',
  AI_MAPPING: 'bg-amber-tint text-amber',
  IMPORTING: 'bg-amber-tint text-amber',
  AWAITING_CONFIRMATION: 'bg-amber-tint text-amber',
  COMPLETED: 'bg-green/20 text-green',
  FAILED: 'bg-red/20 text-red',
  CANCELLED: 'bg-panel-3 text-text-dim',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'ממתין',
  PARSING: 'פרסור',
  AI_MAPPING: 'מיפוי AI',
  IMPORTING: 'מייבא',
  AWAITING_CONFIRMATION: 'ממתין לאישור',
  COMPLETED: 'הושלם',
  FAILED: 'נכשל',
  CANCELLED: 'בוטל',
}

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'הכל' },
  { value: 'PENDING', label: STATUS_LABEL.PENDING },
  { value: 'PARSING', label: STATUS_LABEL.PARSING },
  { value: 'AI_MAPPING', label: STATUS_LABEL.AI_MAPPING },
  { value: 'IMPORTING', label: STATUS_LABEL.IMPORTING },
  { value: 'AWAITING_CONFIRMATION', label: STATUS_LABEL.AWAITING_CONFIRMATION },
  { value: 'COMPLETED', label: STATUS_LABEL.COMPLETED },
  { value: 'FAILED', label: STATUS_LABEL.FAILED },
  { value: 'CANCELLED', label: STATUS_LABEL.CANCELLED },
]

const POLL_INTERVAL_MS = 5000

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const secs = Math.round((now - then) / 1000)
    if (secs < 60) return `לפני ${secs}s`
    const mins = Math.round(secs / 60)
    if (mins < 60) return `לפני ${mins}m`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `לפני ${hours}h`
    const days = Math.round(hours / 24)
    return `לפני ${days}d`
  } catch {
    return iso
  }
}

function truncate(s: string | null, n: number): string {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function AdminJobsTable({ initialRows }: Props) {
  const [rows, setRows] = useState<AdminJobRow[]>(initialRows)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows
    return rows.filter(r => r.status === statusFilter)
  }, [rows, statusFilter])

  const hasNonTerminal = useMemo(
    () => filtered.some(r => !TERMINAL_STATUSES.has(r.status)),
    [filtered],
  )

  const selected = useMemo(
    () => rows.find(r => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  // Smart polling — only tick while at least one visible row is non-terminal.
  // Cleans up when everything settles so the tab stops making requests.
  useEffect(() => {
    if (!hasNonTerminal) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      return
    }
    if (pollTimerRef.current) return
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/jobs', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { jobs?: AdminJobRow[] }
        if (Array.isArray(json.jobs)) setRows(json.jobs)
      } catch {
        // ignore transient poll failures — the next tick will retry
      }
    }, POLL_INTERVAL_MS)
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [hasNonTerminal])

  async function refreshOne(jobId: string) {
    try {
      const res = await fetch('/api/admin/jobs', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as { jobs?: AdminJobRow[] }
      if (Array.isArray(json.jobs)) setRows(json.jobs)
    } catch {
      // best-effort
    }
    void jobId
  }

  async function resetJob(row: AdminJobRow) {
    setError(null)
    if (!TERMINAL_STATUSES.has(row.status)) {
      const ok = window.confirm(
        `המשימה עדיין בסטטוס "${STATUS_LABEL[row.status] ?? row.status}". לאפס בכל זאת?`,
      )
      if (!ok) return
    }
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/jobs/${row.id}/reset`, {
        method: 'POST',
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error ?? 'איפוס המשימה נכשל')
        return
      }
      await refreshOne(row.id)
    } catch {
      setError('שגיאת רשת. נסה שוב.')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteJob(row: AdminJobRow) {
    setError(null)
    const ok = window.confirm(
      `למחוק את המשימה של ${row.userEmail} (${row.originalFilename})? הפעולה מוחקת גם את קובץ ה-xlsx מה-storage.`,
    )
    if (!ok) return
    setBusyId(row.id)
    // Optimistic remove.
    const prev = rows
    setRows(rows.filter(r => r.id !== row.id))
    if (selectedId === row.id) setSelectedId(null)
    try {
      const res = await fetch(`/api/admin/jobs/${row.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setRows(prev)
        setError(j.error ?? 'מחיקה נכשלה')
      }
    } catch {
      setRows(prev)
      setError('שגיאת רשת. נסה שוב.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red/30 bg-red/10 p-3 text-sm text-red"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <label htmlFor="admin-jobs-status-filter" className="text-sm text-text-dim">
          סנן לפי סטטוס:
        </label>
        <select
          id="admin-jobs-status-filter"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-input-bg border border-border rounded-md px-3 py-1.5 text-sm text-text-main"
        >
          {STATUS_FILTER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-dim">
          מציג {filtered.length}/{rows.length}
        </span>
      </div>

      <div className="overflow-x-auto panel">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-panel-2">
            <tr className="text-text-dim">
              <th className="text-right px-4 py-3 font-medium">משתמש</th>
              <th className="text-right px-4 py-3 font-medium">קובץ</th>
              <th className="text-right px-4 py-3 font-medium">גודל</th>
              <th className="text-right px-4 py-3 font-medium">סטטוס</th>
              <th className="text-right px-4 py-3 font-medium">שגיאה</th>
              <th className="text-right px-4 py-3 font-medium">נוצר</th>
              <th className="text-right px-4 py-3 font-medium">עודכן</th>
              <th className="text-right px-4 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-text-dim"
                >
                  אין משימות להצגה בסינון הנוכחי.
                </td>
              </tr>
            ) : (
              filtered.map(r => {
                const busy = busyId === r.id
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-b-0 hover:bg-panel-3/40 transition-colors"
                  >
                    <td
                      className="px-4 py-3 font-mono text-text-main truncate max-w-[240px]"
                      title={r.userEmail}
                    >
                      {r.userEmail}
                    </td>
                    <td
                      className="px-4 py-3 text-text-main truncate max-w-[240px]"
                      title={r.originalFilename}
                    >
                      {truncate(r.originalFilename, 40)}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-dim">
                      {formatBytes(r.fileSize)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold',
                          STATUS_COLORS[r.status] ?? 'bg-panel-3 text-text-dim',
                        )}
                        title={r.status}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-red text-xs max-w-[240px] truncate"
                      title={r.errorMessage ?? undefined}
                    >
                      {truncate(r.errorMessage, 60)}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-text-dim"
                      title={r.createdAt}
                    >
                      {formatRelative(r.createdAt)}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-text-dim"
                      title={r.updatedAt}
                    >
                      {formatRelative(r.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-main hover:border-amber hover:text-amber disabled:opacity-50"
                          aria-label={`הצג פרטים למשימה ${r.originalFilename}`}
                        >
                          <Eye size={12} aria-hidden="true" />
                          פרטים
                        </button>
                        <button
                          type="button"
                          onClick={() => resetJob(r)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-main hover:border-amber hover:text-amber disabled:opacity-50"
                          aria-label={`אפס את המשימה ${r.originalFilename}`}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} aria-hidden="true" />
                          )}
                          אפס
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteJob(r)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-main hover:border-red hover:text-red disabled:opacity-50"
                          aria-label={`מחק את המשימה ${r.originalFilename}`}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} aria-hidden="true" />
                          )}
                          מחק
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-dim">
        סה״כ {rows.length} משימות (200 אחרונות).
        {hasNonTerminal && (
          <span className="ms-2">רענון אוטומטי כל 5 שניות בזמן משימות פעילות.</span>
        )}
      </p>

      {selected && (
        <AdminJobDetail
          jobId={selected.id}
          summary={selected}
          onClose={() => setSelectedId(null)}
          onReset={async () => {
            await resetJob(selected)
          }}
          onDelete={async () => {
            await deleteJob(selected)
          }}
        />
      )}
    </div>
  )
}
