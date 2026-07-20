import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Admin section gate. Mirrors the auth+redirect pattern in
// app/(dashboard)/layout.tsx and layers on an isAdmin check. Inherits the
// dashboard chrome (Header, ChatSidebar, main scroller) from the parent
// (dashboard) group layout, so this file only wraps {children} in a
// section-level container.
export default async function AdminLayout({
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

  return <div className="h-full">{children}</div>
}
