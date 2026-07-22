import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminJobsTable, type AdminJobRow } from '@/components/admin/admin-jobs-table'

export default async function AdminJobsPage() {
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

  // JOIN via two round-trips: fetch jobs, then fetch owners' emails.
  // Supabase JS lacks a first-class relational JOIN when there is no FK
  // relationship declared bilaterally; the ExcelImportJob → User FK is
  // one-directional, and .select('..., User(email)') often misbehaves under
  // the generated types. Two queries + a Map lookup is simpler and safer.
  const { data: jobs, error: jobsErr } = await admin
    .from('ExcelImportJob')
    .select(
      'id, userId, status, originalFilename, fileSize, sourceTimezone, rowCountRaw, errorMessage, createdAt, updatedAt, completedAt',
    )
    .order('createdAt', { ascending: false })
    .limit(200)

  if (jobsErr) {
    console.error('[admin/jobs] failed to load jobs:', jobsErr.message)
  }

  const userIds = Array.from(new Set((jobs ?? []).map(j => j.userId)))
  const emailByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('User')
      .select('id, email')
      .in('id', userIds)
    for (const u of users ?? []) emailByUserId.set(u.id, u.email)
  }

  const initialRows: AdminJobRow[] = (jobs ?? []).map(j => ({
    id: j.id,
    userId: j.userId,
    userEmail: emailByUserId.get(j.userId) ?? '—',
    status: j.status,
    originalFilename: j.originalFilename,
    fileSize: j.fileSize,
    sourceTimezone: j.sourceTimezone,
    rowCountRaw: j.rowCountRaw,
    errorMessage: j.errorMessage,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    completedAt: j.completedAt,
  }))

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-text-main">מנהל — ייבוא AI</h1>
        <p className="text-sm text-text-dim mt-1">
          כל המשימות של ייבוא Excel חכם, על-פני כל המשתמשים, ממוינות מהחדש
          לישן (200 אחרונות). כשמשתמש מתלונן על ייבוא תקוע — כאן רואים את
          הסטטוס, הגדילה של הקובץ, והשגיאה. הלחצנים בכל שורה: <strong>אפס</strong>
          מחזיר את המשימה ל-<code>PENDING</code> כדי שה-worker ייקח אותה שוב;
          <strong> מחק</strong> מוריד גם את הקובץ מ-storage וגם את השורה מ-DB.
        </p>
      </header>

      <AdminJobsTable initialRows={initialRows} />
    </div>
  )
}
