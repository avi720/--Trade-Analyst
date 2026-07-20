import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminUsersTable, type AdminUserRow } from '@/components/admin/admin-users-table'

// Belt-and-braces admin gate (mirrors layout.tsx). Also reads the users
// list via the service-role client so billing columns like
// subscriptionStatus / subscriptionRenewsAt are visible for display —
// authenticated-role RLS blocks them from the regular server client via
// the harden_user_billing_write_paths grants.
export default async function AdminPage() {
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
  const { data: rows, error } = await admin
    .from('User')
    .select(
      'id, email, firstName, lastName, subscriptionTier, subscriptionStatus, subscriptionRenewsAt, isAdmin, createdAt',
    )
    .order('createdAt', { ascending: false })

  if (error) {
    console.error('[admin/page] failed to load users:', error.message)
  }

  const initialRows: AdminUserRow[] = (rows ?? []).map(r => ({
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    subscriptionTier: r.subscriptionTier,
    subscriptionStatus: r.subscriptionStatus,
    subscriptionRenewsAt: r.subscriptionRenewsAt,
    isAdmin: r.isAdmin,
    createdAt: r.createdAt,
  }))

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-text-main">מנהל — משתמשים</h1>
        <p className="text-sm text-text-dim mt-1">
          רשימת כל המשתמשים ומסלול המנוי שלהם. הלחצן מחליף בין Free ל-Pro
          לצורך בדיקת פיצ׳רים מוגבלי-Pro (ייבוא Excel אוטומטי, סנכרון IBKR,
          חנן ללא הגבלה וכו׳). לחיצה כותבת גם `subscriptionStatus` פיקטיבי
          כדי שהמסך ״מנוי״ בפרופיל יראה מצב עקבי, אך לא נוגעת ב-Lemon Squeezy
          IDs — כך שוובהוק אמיתי עדיין דורס את המצב הפיקטיבי בצורה נקייה.
        </p>
      </header>

      <AdminUsersTable initialRows={initialRows} />
    </div>
  )
}
