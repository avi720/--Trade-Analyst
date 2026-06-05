import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/header'
import { ChatContextProvider } from '@/lib/chat/chat-context'
import { ChatSidebar } from '@/components/chat-sidebar'
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
  const { error: upsertError } = await supabase
    .from('User')
    .upsert(userRow, { onConflict: 'id', ignoreDuplicates: true })

  if (upsertError) {
    console.error('[layout] User upsert failed:', upsertError)
  }

  // Funnel users with incomplete profiles (e.g. fresh Google sign-ins) into the signup wizard
  const { data: profile } = await supabase
    .from('User')
    .select('firstName')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.firstName) {
    redirect('/signup')
  }

  return (
    <ChatContextProvider>
      <a href="#main-content" className="skip-link font-sans text-sm">
        דלג לתוכן הראשי
      </a>
      <div className="flex flex-col h-screen overflow-hidden">
        <Header userEmail={user.email} />
        <main id="main-content" className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <ChatSidebar />
    </ChatContextProvider>
  )
}
