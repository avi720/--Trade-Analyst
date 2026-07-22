import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminIbkrTable, type AdminIbkrRow } from '@/components/admin/admin-ibkr-table'

export default async function AdminIbkrPage() {
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

  const { data: conns, error: connsErr } = await admin
    .from('BrokerConnection')
    .select(
      'id, userId, brokerName, accountId, isActive, lastSyncAt, lastSyncStatus, lastSyncError',
    )
    .order('lastSyncAt', { ascending: false, nullsFirst: false })

  if (connsErr) {
    console.error('[admin/ibkr] failed to load connections:', connsErr.message)
  }

  const userIds = Array.from(new Set((conns ?? []).map(c => c.userId)))
  const emailByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('User')
      .select('id, email')
      .in('id', userIds)
    for (const u of users ?? []) emailByUserId.set(u.id, u.email)
  }

  const initialRows: AdminIbkrRow[] = (conns ?? []).map(c => ({
    id: c.id,
    userId: c.userId,
    userEmail: emailByUserId.get(c.userId) ?? '—',
    brokerName: c.brokerName,
    accountId: c.accountId,
    isActive: c.isActive,
    lastSyncAt: c.lastSyncAt,
    lastSyncStatus: c.lastSyncStatus,
    lastSyncError: c.lastSyncError,
  }))

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-text-main">מנהל — ברוקר</h1>
        <p className="text-sm text-text-dim mt-1">
          כל חיבורי הברוקר הפעילים במערכת. הסנכרון האוטומטי רץ פעמיים ביום
          (13:00 ו-20:00 UTC) מ-GitHub Actions. כשמשתמש מדווח על "טריידים
          חסרים" — הכפתור "סנכרן עכשיו" מפעיל <em>מיידית</em> את אותה pipeline
          עבור החיבור הזה. Response 202 מיידי; המצב מתעדכן בטבלה כשהסנכרון
          מסתיים (בד"כ 30-90 שניות). לא-מוצלח? עמודת "שגיאה" תעודכן.
        </p>
      </header>

      <AdminIbkrTable initialRows={initialRows} />
    </div>
  )
}
