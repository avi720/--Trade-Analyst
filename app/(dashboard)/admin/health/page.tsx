import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AdminHealthDashboard,
  type MetricsSnapshot,
  type TableSizeRow,
  type TimeseriesRow,
  type RecentFailureRow,
} from '@/components/admin/admin-health-dashboard'

export const dynamic = 'force-dynamic'

export default async function AdminHealthPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('User')
    .select('isAdmin')
    .eq('id', user.id)
    .maybeSingle()

  if (!me?.isAdmin) redirect('/research')

  const admin = createAdminClient()

  const [metricsRes, sizesRes, seriesRes, failuresRes] = await Promise.all([
    admin.rpc('admin_system_metrics'),
    admin.rpc('admin_table_sizes'),
    admin.rpc('admin_timeseries', { days: 30 }),
    admin
      .from('AuditEvent')
      .select('id, createdAt, userId, eventType, metadata, ipAddress')
      .eq('status', 'failure')
      .order('createdAt', { ascending: false })
      .limit(20),
  ])

  if (metricsRes.error) {
    console.error('[admin/health] metrics rpc failed:', metricsRes.error.message)
  }
  if (sizesRes.error) {
    console.error('[admin/health] table_sizes rpc failed:', sizesRes.error.message)
  }
  if (seriesRes.error) {
    console.error('[admin/health] timeseries rpc failed:', seriesRes.error.message)
  }
  if (failuresRes.error) {
    console.error('[admin/health] failures fetch failed:', failuresRes.error.message)
  }

  const metrics = (metricsRes.data as unknown as MetricsSnapshot | null) ?? EMPTY_METRICS
  const tableSizes: TableSizeRow[] = (sizesRes.data ?? []).map(r => ({
    tableName: r.tableName,
    sizeBytes: Number(r.sizeBytes),
  }))
  const timeseries: TimeseriesRow[] = (seriesRes.data ?? []).map(r => ({
    day: r.day,
    signups: Number(r.signups),
    trades: Number(r.trades),
  }))

  const failureRows = failuresRes.data ?? []
  const failureUserIds = Array.from(
    new Set(failureRows.map(r => r.userId).filter((x): x is string => Boolean(x))),
  )
  const emailByUserId = new Map<string, string>()
  if (failureUserIds.length > 0) {
    const { data: users } = await admin
      .from('User')
      .select('id, email')
      .in('id', failureUserIds)
    for (const u of users ?? []) emailByUserId.set(u.id, u.email)
  }
  const recentFailures: RecentFailureRow[] = failureRows.map(r => ({
    id: r.id,
    createdAt: r.createdAt,
    userEmail: r.userId ? emailByUserId.get(r.userId) ?? null : null,
    eventType: r.eventType,
    metadata: r.metadata,
    ipAddress: r.ipAddress,
  }))

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-text-main">מנהל — בריאות המערכת</h1>
        <p className="text-sm text-text-dim mt-1">
          תמונת מצב read-only של המערכת. מדדים בסיסיים, שימור משתמשים,
          פעילות מסחר, אינטגרציות, שימוש בצ׳אט, ושגיאות אחרונות. הנתונים
          נקראים בכל טעינה מדף — אין polling. Refresh כדי לרענן.
        </p>
      </header>

      <AdminHealthDashboard
        metrics={metrics}
        tableSizes={tableSizes}
        timeseries={timeseries}
        recentFailures={recentFailures}
      />
    </div>
  )
}

const EMPTY_METRICS: MetricsSnapshot = {
  usersTotal: 0,
  usersPro: 0,
  usersFree: 0,
  usersSignups7d: 0,
  retention30d_eligible: 0,
  retention30d_active: 0,
  retention60d_eligible: 0,
  retention60d_active: 0,
  retention90d_eligible: 0,
  retention90d_active: 0,
  tradesTotal: 0,
  tradesOpen: 0,
  tradesClosed: 0,
  trades7d: 0,
  ordersTotal: 0,
  orders7d: 0,
  brokerConnectionsActive: 0,
  jobsPending: 0,
  jobsFailed: 0,
  ibkrSyncTotal7d: 0,
  ibkrSyncSuccess7d: 0,
  chatConversations24h: 0,
  chatConversations7d: 0,
  chatActiveUsers24h: 0,
  chatActiveUsers7d: 0,
  auditFailures24h: 0,
}
