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

  // Read first. On a hit we already have the firstName for the signup-funnel
  // guard below and avoid the upsert entirely. On a miss the row genuinely
  // does not exist yet (first dashboard visit after auth) — insert it. Do not
  // upsert on every request: `settings: {}` would clobber the user's saved
  // display preferences.
  const { data: existing } = await supabase
    .from('User')
    .select('firstName, isAdmin, subscriptionTier')
    .eq('id', user.id)
    .maybeSingle()

  let firstName: string | null | undefined = existing?.firstName
  let isAdmin = existing?.isAdmin ?? false
  // P1-E: the chat sidebar's filter-respect toggle is Pro-only. Reading the
  // tier here rides along on a query the layout already runs — no extra trip.
  // This drives presentation only; the chat route re-checks server-side.
  let isPro = existing?.subscriptionTier === 'Pro'

  if (!existing) {
    const userRow: TablesInsert<'User'> = {
      id: user.id,
      email: user.email!,
      settings: {},
    }
    const { data: inserted, error: insertError } = await supabase
      .from('User')
      .insert(userRow)
      .select('firstName, isAdmin, subscriptionTier')
      .single()
    if (insertError) {
      console.error('[layout] User insert failed:', insertError)
    }
    firstName = inserted?.firstName
    isAdmin = inserted?.isAdmin ?? false
    isPro = inserted?.subscriptionTier === 'Pro'
  }

  // Funnel users with incomplete profiles (e.g. fresh Google sign-ins) into the signup wizard
  if (!firstName) {
    redirect('/signup')
  }

  return (
    <ChatContextProvider>
      <a href="#main-content" className="skip-link font-sans text-sm">
        דלג לתוכן הראשי
      </a>
      <div className="flex flex-col h-dvh overflow-hidden">
        <Header userEmail={user.email} isAdmin={isAdmin} />
        <main id="main-content" className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <ChatSidebar isPro={isPro} />
    </ChatContextProvider>
  )
}
