'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface AdminIbkrRow {
  id: string
  userId: string
  userEmail: string
  brokerName: string
  accountId: string | null
  isActive: boolean
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncError: string | null
}

interface Props {
  initialRows: AdminIbkrRow[]
}

const POLL_INTERVAL_MS = 5000
const IN_PROGRESS_SET = new Set(['SYNCING', 'PENDING'])

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

function statusBadgeClass(status: string | null): string {
  if (!status) return 'bg-panel-3 text-text-dim'
  if (status === 'SUCCESS') return 'bg-green/20 text-green'
  if (status === 'ERROR') return 'bg-red/20 text-red'
  if (status === 'TRANSIENT_ERROR') return 'bg-amber-tint text-amber'
  return 'bg-panel-3 text-text-dim'
}

function statusLabel(status: string | null): string {
  if (!status) return '—'
  const map: Record<string, string> = {
    SUCCESS: 'הצלחה',
    ERROR: 'שגיאה',
    TRANSIENT_ERROR: 'שגיאה זמנית',
    PENDING: 'ממתין',
    SYNCING: 'מסנכרן',
  }
  return map[status] ?? status
}

function truncate(s: string | null, n: number): string {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function AdminIbkrTable({ initialRows }: Props) {
  const [rows, setRows] = useState<AdminIbkrRow[]>(initialRows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasInFlight = rows.some(
    r => busyId === r.id || IN_PROGRESS_SET.has(r.lastSyncStatus ?? ''),
  )

  useEffect(() => {
    if (!hasInFlight) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      return
    }
    if (pollTimerRef.current) return
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/ibkr', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { connections?: AdminIbkrRow[] }
        if (Array.isArray(json.connections)) setRows(json.connections)
      } catch {
        // ignore transient poll failures
      }
    }, POLL_INTERVAL_MS)
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [hasInFlight])

  async function syncNow(row: AdminIbkrRow) {
    setError(null)
    setNotice(null)
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/ibkr/${row.id}/sync`, {
        method: 'POST',
      })
      if (!res.ok && res.status !== 202) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error ?? 'הפעלת סנכרון נכשלה')
        return
      }
      setNotice(
        `הסנכרון הופעל עבור ${row.userEmail}. המצב יתעדכן בטבלה כשה-pipeline מסיים (30-90 שניות).`,
      )
    } catch {
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
      {notice && (
        <div
          role="status"
          className="rounded-md border border-amber/30 bg-amber-tint p-3 text-sm text-amber"
        >
          {notice}
        </div>
      )}

      <div className="overflow-x-auto panel">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-panel-2">
            <tr className="text-text-dim">
              <th className="text-right px-4 py-3 font-medium">משתמש</th>
              <th className="text-right px-4 py-3 font-medium">ברוקר</th>
              <th className="text-right px-4 py-3 font-medium">חשבון</th>
              <th className="text-right px-4 py-3 font-medium">פעיל</th>
              <th className="text-right px-4 py-3 font-medium">סנכרון אחרון</th>
              <th className="text-right px-4 py-3 font-medium">מצב</th>
              <th className="text-right px-4 py-3 font-medium">שגיאה</th>
              <th className="text-right px-4 py-3 font-medium">פעולה</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-dim">
                  אין חיבורי ברוקר להצגה.
                </td>
              </tr>
            ) : (
              rows.map(r => {
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
                    <td className="px-4 py-3 text-text-main">{r.brokerName}</td>
                    <td className="px-4 py-3 font-mono text-text-dim">
                      {r.accountId ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold',
                          r.isActive
                            ? 'bg-green/20 text-green'
                            : 'bg-panel-3 text-text-dim',
                        )}
                      >
                        {r.isActive ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-text-dim"
                      title={r.lastSyncAt ?? undefined}
                    >
                      {formatRelative(r.lastSyncAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold',
                          statusBadgeClass(r.lastSyncStatus),
                        )}
                        title={r.lastSyncStatus ?? undefined}
                      >
                        {statusLabel(r.lastSyncStatus)}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-red text-xs max-w-[240px] truncate"
                      title={r.lastSyncError ?? undefined}
                    >
                      {truncate(r.lastSyncError, 60)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => syncNow(r)}
                        disabled={busy || !r.isActive}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-text-main hover:border-amber hover:text-amber disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`סנכרן את החיבור של ${r.userEmail}`}
                      >
                        {busy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RefreshCw size={12} aria-hidden="true" />
                        )}
                        סנכרן עכשיו
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-dim">
        סה״כ {rows.length} חיבורים.
        {hasInFlight && (
          <span className="ms-2">רענון אוטומטי כל 5 שניות בזמן סנכרון פעיל.</span>
        )}
      </p>
    </div>
  )
}
