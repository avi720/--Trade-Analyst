import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AdminBrokerEventsTable,
  type AdminBrokerEventRow,
} from '@/components/admin/admin-broker-events-table'

const PAGE_SIZE = 50

interface SearchParams {
  page?: string
  status?: string
}

export default async function AdminBrokerEventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
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

  const sp = await searchParams
  const page = Math.max(0, parseInt(sp.page ?? '0', 10) || 0)
  const statusFilter = sp.status ?? 'all'

  const admin = createAdminClient()

  let q = admin
    .from('BrokerEvent')
    .select(
      'id, userId, source, eventType, processingStatus, processingError, receivedAt, processedAt',
      { count: 'exact' },
    )
    .order('receivedAt', { ascending: false })

  if (statusFilter !== 'all') {
    q = q.eq('processingStatus', statusFilter)
  }

  q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const { data: events, error: eventsErr, count } = await q

  if (eventsErr) {
    console.error('[admin/broker-events] failed:', eventsErr.message)
  }

  const userIds = Array.from(new Set((events ?? []).map(e => e.userId)))
  const emailByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('User')
      .select('id, email')
      .in('id', userIds)
    for (const u of users ?? []) emailByUserId.set(u.id, u.email)
  }

  const initialRows: AdminBrokerEventRow[] = (events ?? []).map(e => ({
    id: e.id,
    userId: e.userId,
    userEmail: emailByUserId.get(e.userId) ?? '—',
    source: e.source,
    eventType: e.eventType,
    processingStatus: e.processingStatus,
    processingError: e.processingError,
    receivedAt: e.receivedAt,
    processedAt: e.processedAt,
  }))

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-text-main">מנהל — אירועי ברוקר</h1>
        <p className="text-sm text-text-dim mt-1">
          כל אירוע ברוקר (FLEX_FETCH ואחרים) בכל המשתמשים, ממוינים מהחדש
          לישן. ה-payload הגולמי (XML/JSON) נשמר לצורך audit ומוצג בפרטים.
          הפעולה היחידה כאן היא צפייה בלבד — אין reprocess.
        </p>
      </header>

      <AdminBrokerEventsTable
        initialRows={initialRows}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={count ?? 0}
        statusFilter={statusFilter}
      />
    </div>
  )
}
