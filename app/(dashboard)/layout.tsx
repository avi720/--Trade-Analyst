import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/header'
import type { TablesInsert } from '@/lib/db/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Ensure our app User row exists (no-op if already present).
  // Runs as the authenticated user — RLS allows upsert of own row.
  const userRow: TablesInsert<'User'> = {
    id: user.id,
    email: user.email!,
    settings: {},
  }
  const { error } = await supabase
    .from('User')
    .upsert(userRow, { onConflict: 'id', ignoreDuplicates: false })

  if (error) {
    console.error('[layout] User upsert failed:', error)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header userEmail={user.email} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
