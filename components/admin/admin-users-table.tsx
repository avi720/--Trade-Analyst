'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface AdminUserRow {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  subscriptionTier: string
  subscriptionStatus: string | null
  subscriptionRenewsAt: string | null
  isAdmin: boolean
  createdAt: string
}

interface Props {
  initialRows: AdminUserRow[]
}

function displayName(r: AdminUserRow): string {
  const parts = [r.firstName, r.lastName].filter(Boolean) as string[]
  return parts.length > 0 ? parts.join(' ') : '—'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל',
  on_trial: 'ניסיון',
  past_due: 'מעוכב',
  paused: 'מושהה',
  cancelled: 'מבוטל',
  expired: 'פג',
  unpaid: 'לא שולם',
}

export function AdminUsersTable({ initialRows }: Props) {
  const [rows, setRows] = useState<AdminUserRow[]>(initialRows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggleTier(row: AdminUserRow) {
    setError(null)
    setBusyId(row.id)
    // Optimistic patch — flip to the opposite of current tier.
    const nextTier = row.subscriptionTier === 'Pro' ? 'Free' : 'Pro'
    const prevSnapshot = row
    setRows(prev =>
      prev.map(r =>
        r.id === row.id
          ? {
              ...r,
              subscriptionTier: nextTier,
              subscriptionStatus:
                nextTier === 'Pro' ? 'active' : 'cancelled',
              subscriptionRenewsAt:
                nextTier === 'Pro'
                  ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
                  : null,
            }
          : r,
      ),
    )
    try {
      const res = await fetch(`/api/admin/users/${row.id}/toggle-tier`, {
        method: 'POST',
      })
      const json = (await res.json().catch(() => ({}))) as {
        tier?: string
        status?: string | null
        renewsAt?: string | null
        error?: string
      }
      if (!res.ok) {
        // Revert.
        setRows(prev => prev.map(r => (r.id === row.id ? prevSnapshot : r)))
        setError(json.error ?? 'שגיאה בעדכון מסלול')
        return
      }
      // Reconcile with server truth in case status/renewsAt shape drifts.
      setRows(prev =>
        prev.map(r =>
          r.id === row.id
            ? {
                ...r,
                subscriptionTier: json.tier ?? nextTier,
                subscriptionStatus: json.status ?? r.subscriptionStatus,
                subscriptionRenewsAt: json.renewsAt ?? null,
              }
            : r,
        ),
      )
    } catch {
      setRows(prev => prev.map(r => (r.id === row.id ? prevSnapshot : r)))
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

      <div className="overflow-x-auto panel">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-panel-2">
            <tr className="text-text-dim">
              <th className="text-right px-4 py-3 font-medium">אימייל</th>
              <th className="text-right px-4 py-3 font-medium">שם</th>
              <th className="text-right px-4 py-3 font-medium">מסלול</th>
              <th className="text-right px-4 py-3 font-medium">סטטוס</th>
              <th className="text-right px-4 py-3 font-medium">חידוש</th>
              <th className="text-right px-4 py-3 font-medium">נוצר</th>
              <th className="text-right px-4 py-3 font-medium">פעולה</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-text-dim"
                >
                  אין משתמשים להצגה.
                </td>
              </tr>
            ) : (
              rows.map(r => {
                const isPro = r.subscriptionTier === 'Pro'
                const busy = busyId === r.id
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-b-0 hover:bg-panel-3/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-text-main truncate max-w-[280px]">
                      <span className="inline-flex items-center gap-2">
                        {r.email}
                        {r.isAdmin && (
                          <span
                            title="מנהל"
                            className="text-[10px] font-semibold uppercase tracking-wider text-amber bg-amber-tint px-1.5 py-0.5 rounded"
                          >
                            admin
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-main">{displayName(r)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold',
                          isPro
                            ? 'bg-amber-tint text-amber'
                            : 'bg-panel-3 text-text-dim',
                        )}
                      >
                        {isPro && <Sparkles size={11} aria-hidden="true" />}
                        {isPro ? 'Pro' : 'Free'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-dim">
                      {r.subscriptionStatus
                        ? STATUS_LABEL[r.subscriptionStatus] ?? r.subscriptionStatus
                        : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-dim">
                      {formatDate(r.subscriptionRenewsAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-dim">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleTier(r)}
                        disabled={busy}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                          isPro
                            ? 'border border-border text-text-main hover:border-red hover:text-red'
                            : 'bg-amber text-bg-dark hover:bg-amber/90',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                        )}
                      >
                        {busy ? (
                          <Loader2
                            size={12}
                            className="animate-spin"
                            aria-label="טוען"
                          />
                        ) : isPro ? (
                          'החזר ל-Free'
                        ) : (
                          'שדרג ל-Pro'
                        )}
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
        סה״כ {rows.length} משתמשים.
      </p>
    </div>
  )
}
