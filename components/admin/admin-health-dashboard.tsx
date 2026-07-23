'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  TOOLTIP_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  AXIS_TICK,
  GRID_STROKE,
  AXIS_STROKE,
} from '@/components/research/shell'

export interface MetricsSnapshot {
  usersTotal: number
  usersPro: number
  usersFree: number
  usersSignups7d: number
  retention30d_eligible: number
  retention30d_active: number
  retention60d_eligible: number
  retention60d_active: number
  retention90d_eligible: number
  retention90d_active: number
  tradesTotal: number
  tradesOpen: number
  tradesClosed: number
  trades7d: number
  ordersTotal: number
  orders7d: number
  brokerConnectionsActive: number
  jobsPending: number
  jobsFailed: number
  ibkrSyncTotal7d: number
  ibkrSyncSuccess7d: number
  chatConversations24h: number
  chatConversations7d: number
  chatActiveUsers24h: number
  chatActiveUsers7d: number
  auditFailures24h: number
}

export interface TableSizeRow {
  tableName: string
  sizeBytes: number
}

export interface TimeseriesRow {
  day: string
  signups: number
  trades: number
}

export interface RecentFailureRow {
  id: string
  createdAt: string
  userEmail: string | null
  eventType: string
  metadata: unknown
  ipAddress: string | null
}

interface Props {
  metrics: MetricsSnapshot
  tableSizes: TableSizeRow[]
  timeseries: TimeseriesRow[]
  recentFailures: RecentFailureRow[]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

function formatPct(num: number, den: number): string {
  if (den === 0) return '—'
  return `${((num / den) * 100).toFixed(1)}%`
}

function shortDay(iso: string): string {
  // "2026-07-23" → "07-23"
  return iso.slice(5)
}

function truncateJson(value: unknown, max: number): string {
  if (value == null) return '—'
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value)
    return s.length > max ? s.slice(0, max) + '…' : s
  } catch {
    return '—'
  }
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="panel px-4 py-3 flex flex-col gap-1">
      <p className="text-xs text-text-dim">{label}</p>
      <p className="text-lg font-semibold text-text-main font-mono">{value}</p>
      {hint && <p className="text-[10px] text-text-faint">{hint}</p>}
    </div>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-amber uppercase tracking-widest mt-2 mb-2">
      {children}
    </h2>
  )
}

export function AdminHealthDashboard({
  metrics,
  tableSizes,
  timeseries,
  recentFailures,
}: Props) {
  const m = metrics

  const seriesData = useMemo(
    () =>
      timeseries.map(r => ({
        day: shortDay(r.day),
        signups: r.signups,
        trades: r.trades,
      })),
    [timeseries],
  )

  return (
    <div className="space-y-8">
      {/* ── Users ── */}
      <section>
        <GroupHeading>משתמשים</GroupHeading>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="סה״כ" value={m.usersTotal} />
          <StatCard label="Pro" value={m.usersPro} />
          <StatCard label="Free" value={m.usersFree} />
          <StatCard label="הרשמות (7 ימים)" value={m.usersSignups7d} />
        </div>
      </section>

      {/* ── Retention ── */}
      <section>
        <GroupHeading>שימור (Retention)</GroupHeading>
        <p className="text-xs text-text-dim mb-2">
          "פעיל" = ביצע Order ב-14 הימים האחרונים. הקוהורט = משתמשים שנרשמו לפני N ימים או יותר.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard
            label="30 יום"
            value={formatPct(m.retention30d_active, m.retention30d_eligible)}
            hint={`${m.retention30d_active} מתוך ${m.retention30d_eligible}`}
          />
          <StatCard
            label="60 יום"
            value={formatPct(m.retention60d_active, m.retention60d_eligible)}
            hint={`${m.retention60d_active} מתוך ${m.retention60d_eligible}`}
          />
          <StatCard
            label="90 יום"
            value={formatPct(m.retention90d_active, m.retention90d_eligible)}
            hint={`${m.retention90d_active} מתוך ${m.retention90d_eligible}`}
          />
        </div>
      </section>

      {/* ── Activity ── */}
      <section>
        <GroupHeading>פעילות מסחר</GroupHeading>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Trades — סה״כ" value={m.tradesTotal} />
          <StatCard label="Trades — פתוחים" value={m.tradesOpen} />
          <StatCard label="Trades — סגורים" value={m.tradesClosed} />
          <StatCard label="Trades חדשים (7 ימים)" value={m.trades7d} />
          <StatCard label="Orders — סה״כ" value={m.ordersTotal} />
          <StatCard label="Orders חדשים (7 ימים)" value={m.orders7d} />
        </div>
      </section>

      {/* ── Integrations + IBKR ── */}
      <section>
        <GroupHeading>אינטגרציות</GroupHeading>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="חיבורי ברוקר פעילים" value={m.brokerConnectionsActive} />
          <StatCard label="Jobs ממתינים" value={m.jobsPending} />
          <StatCard label="Jobs נכשלו" value={m.jobsFailed} />
          <StatCard
            label="IBKR הצלחה (7 ימים)"
            value={formatPct(m.ibkrSyncSuccess7d, m.ibkrSyncTotal7d)}
            hint={`${m.ibkrSyncSuccess7d} מתוך ${m.ibkrSyncTotal7d}`}
          />
        </div>
      </section>

      {/* ── Chat ── */}
      <section>
        <GroupHeading>שימוש בצ׳אט</GroupHeading>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="שיחות (24 שעות)" value={m.chatConversations24h} />
          <StatCard label="משתמשים פעילים (24 שעות)" value={m.chatActiveUsers24h} />
          <StatCard label="שיחות (7 ימים)" value={m.chatConversations7d} />
          <StatCard label="משתמשים פעילים (7 ימים)" value={m.chatActiveUsers7d} />
        </div>
      </section>

      {/* ── Health ── */}
      <section>
        <GroupHeading>בריאות</GroupHeading>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="AuditEvent failures (24 שעות)" value={m.auditFailures24h} />
        </div>
      </section>

      {/* ── Time-series charts ── */}
      <section>
        <GroupHeading>מגמות — 30 ימים אחרונים</GroupHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="panel p-4">
            <h3 className="text-sm font-semibold text-text-main mb-3">הרשמות יומיות</h3>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={seriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke={AXIS_STROKE}
                    tick={{ ...AXIS_TICK, fontSize: 10 }}
                    tickMargin={4}
                    reversed
                  />
                  <YAxis
                    stroke={AXIS_STROKE}
                    tick={{ ...AXIS_TICK, fontSize: 10 }}
                    tickMargin={4}
                    allowDecimals={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                  />
                  <Line
                    type="monotone"
                    dataKey="signups"
                    name="הרשמות"
                    stroke="#FFB800"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel p-4">
            <h3 className="text-sm font-semibold text-text-main mb-3">Trades שנפתחו</h3>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={seriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke={AXIS_STROKE}
                    tick={{ ...AXIS_TICK, fontSize: 10 }}
                    tickMargin={4}
                    reversed
                  />
                  <YAxis
                    stroke={AXIS_STROKE}
                    tick={{ ...AXIS_TICK, fontSize: 10 }}
                    tickMargin={4}
                    allowDecimals={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                  />
                  <Line
                    type="monotone"
                    dataKey="trades"
                    name="Trades"
                    stroke="#2CC84A"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* ── DB table sizes ── */}
      <section>
        <GroupHeading>גודל טבלאות</GroupHeading>
        <div className="overflow-x-auto panel">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-panel-2">
              <tr className="text-text-dim">
                <th className="text-right px-4 py-2 font-medium">טבלה</th>
                <th className="text-right px-4 py-2 font-medium">גודל</th>
                <th className="text-right px-4 py-2 font-medium font-mono">bytes</th>
              </tr>
            </thead>
            <tbody>
              {tableSizes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-text-dim">
                    אין נתונים.
                  </td>
                </tr>
              ) : (
                tableSizes.map(r => (
                  <tr key={r.tableName} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 font-mono text-text-main">{r.tableName}</td>
                    <td className="px-4 py-2 text-text-main font-mono">
                      {formatBytes(r.sizeBytes)}
                    </td>
                    <td className="px-4 py-2 text-text-dim font-mono text-xs">
                      {r.sizeBytes.toLocaleString('en-US')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Recent failures ── */}
      <section>
        <GroupHeading>שגיאות AuditEvent אחרונות (20 אחרונות)</GroupHeading>
        <div className="overflow-x-auto panel">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-panel-2">
              <tr className="text-text-dim">
                <th className="text-right px-4 py-2 font-medium">מתי</th>
                <th className="text-right px-4 py-2 font-medium">משתמש</th>
                <th className="text-right px-4 py-2 font-medium">סוג</th>
                <th className="text-right px-4 py-2 font-medium">Metadata</th>
                <th className="text-right px-4 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {recentFailures.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-text-dim">
                    אין שגיאות ב-AuditEvent — נקי.
                  </td>
                </tr>
              ) : (
                recentFailures.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td
                      className="px-4 py-2 font-mono text-text-dim text-xs whitespace-nowrap"
                      title={r.createdAt}
                    >
                      {r.createdAt}
                    </td>
                    <td className="px-4 py-2 font-mono text-text-main text-xs truncate max-w-[180px]">
                      {r.userEmail ?? '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-red text-xs">
                      {r.eventType}
                    </td>
                    <td
                      className="px-4 py-2 font-mono text-text-dim text-xs max-w-[280px] truncate"
                      title={typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata)}
                    >
                      {truncateJson(r.metadata, 80)}
                    </td>
                    <td className="px-4 py-2 font-mono text-text-dim text-xs">
                      {r.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
