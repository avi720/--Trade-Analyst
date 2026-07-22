import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminLayout as AdminLayoutShell } from '@/components/admin/admin-layout'

// Admin section gate. Mirrors the auth+redirect pattern in
// app/(dashboard)/layout.tsx and layers on an isAdmin check. Inherits the
// dashboard chrome (Header, ChatSidebar, main scroller) from the parent
// (dashboard) group layout. Wraps {children} in the sub-tabs shell added
// in Phase 2, which owns the vertical sidebar with sub-tab navigation.
export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data } = await supabase
    .from('User')
    .select('isAdmin')
    .eq('id', user.id)
    .maybeSingle()

  if (!data?.isAdmin) redirect('/research')

  return <AdminLayoutShell>{children}</AdminLayoutShell>
}
