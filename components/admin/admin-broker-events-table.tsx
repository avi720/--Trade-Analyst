'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AdminBrokerEventDetail } from './admin-broker-event-detail'

export interface AdminBrokerEventRow {
  id: string
  userId: string
  userEmail: string
  source: string
  eventType: string
  processingStatus: string
  processingError: string | null
  receivedAt: string
  processedAt: string | null
}

interface Props {
  initialRows: AdminBrokerEventRow[]
  page: number
  pageSize: number
  totalCount: number
  statusFilter: string
}

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'הכל' },
  { value: 'PROCESSED', label: 'עובד' },
  { value: 'ERROR', label: 'שגיאה' },
  { value: 'PENDING', label: 'ממתין' },
]

const STATUS_COLORS: Record<string, string> = {
  PROCESSED: 'bg-green/20 text-green',
  ERROR: 'bg-red/20 text-red',
  PENDING: 'bg-amber-tint text-amber',
}

const STATUS_LABEL: Record<string, string> = {
  PROCESSED: 'עובד',
  ERROR: 'שגיאה',
  PENDING: 'ממתין',
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

export function AdminBrokerEventsTable({
  initialRows,
  page,
  pageSize,
  totalCount,
  statusFilter,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [emailQuery, setEmailQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!emailQuery.trim()) return initialRows
    const q = emailQuery.toLowerCase()
    return initialRows.filter(r => r.userEmail.toLowerCase().includes(q))
  }, [initialRows, emailQuery])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  function updateSearchParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k)
      else params.set(k, v)
    }
    const qs = params.toString()
    router.push(qs ? `/admin/broker-events?${qs}` : '/admin/broker-events')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="be-status-filter" className="text-sm text-text-dim">
          סטטוס:
        </label>
        <select
          id="be-status-filter"
          value={statusFilter}
          onChange={e => updateSearchParams({ status: e.target.value === 'all' ? null : e.target.value, page: null })}
          className="bg-input-bg border border-border rounded-md px-3 py-1.5 text-sm text-text-main"
        >
          {STATUS_FILTER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor="be-email-filter" className="text-sm text-text-dim ms-3">
          חפש אימייל:
        </label>
        <input
          id="be-email-filter"
          type="text"
          value={emailQuery}
          onChange={e => setEmailQuery(e.target.value)}
          placeholder="מסנן דף נוכחי"
          className="bg-input-bg border border-border rounded-md px-3 py-1.5 text-sm text-text-main w-48"
        />

        <span className="text-xs text-text-dim ms-auto">
          {totalCount} סה״כ · דף {page + 1}/{totalPages}
        </span>
      </div>

      <div className="overflow-x-auto panel">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-panel-2">
            <tr className="text-text-dim">
              <th className="text-right px-4 py-3 font-medium">משתמש</th>
              <th className="text-right px-4 py-3 font-medium">מקור</th>
              <th className="text-right px-4 py-3 font-medium">סוג</th>
              <th className="text-right px-4 py-3 font-medium">מצב</th>
              <th className="text-right px-4 py-3 font-medium">שגיאה</th>
              <th className="text-right px-4 py-3 font-medium">התקבל</th>
              <th className="text-right px-4 py-3 font-medium">עובד</th>
              <th className="text-right px-4 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-dim">
                  אין אירועים להצגה בסינון הנוכחי.
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-b-0 hover:bg-panel-3/40 transition-colors"
                >
                  <td
                    className="px-4 py-3 font-mono text-text-main truncate max-w-[220px]"
                    title={r.userEmail}
                  >
                    {r.userEmail}
                  </td>
                  <td className="px-4 py-3 font-mono text-text-dim text-xs">
                    {r.source}
                  </td>
                  <td className="px-4 py-3 font-mono text-text-dim text-xs">
                    {r.eventType}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold',
                        STATUS_COLORS[r.processingStatus] ??
                          'bg-panel-3 text-text-dim',
                      )}
                      title={r.processingStatus}
                    >
                      {STATUS_LABEL[r.processingStatus] ?? r.processingStatus}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 text-red text-xs max-w-[220px] truncate"
                    title={r.processingError ?? undefined}
                  >
                    {truncate(r.processingError, 60)}
                  </td>
                  <td
                    className="px-4 py-3 font-mono text-text-dim"
                    title={r.receivedAt}
                  >
                    {formatRelative(r.receivedAt)}
                  </td>
                  <td
                    className="px-4 py-3 font-mono text-text-dim"
                    title={r.processedAt ?? undefined}
                  >
                    {formatRelative(r.processedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-main hover:border-amber hover:text-amber"
                      aria-label={`הצג פרטים לאירוע ${r.id}`}
                    >
                      <Eye size={12} aria-hidden="true" />
                      פרטים
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-text-dim">
          מציג {filtered.length} מתוך {initialRows.length} בדף הנוכחי (כולל
          סינון אימייל).
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() =>
              updateSearchParams({ page: page === 1 ? null : String(page - 1) })
            }
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-main hover:border-amber hover:text-amber disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="דף קודם"
          >
            <ChevronRight size={12} aria-hidden="true" />
            קודם
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => updateSearchParams({ page: String(page + 1) })}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-main hover:border-amber hover:text-amber disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="דף הבא"
          >
            הבא
            <ChevronLeft size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {selectedId && (
        <AdminBrokerEventDetail
          eventId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
