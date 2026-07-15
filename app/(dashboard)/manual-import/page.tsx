import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getUserTier,
  getUserTradeCount,
  MANUAL_TRADE_LIMIT_FREE,
} from '@/lib/billing/tier'
import { ManualImportTabs } from '@/components/manual-import-tabs'
import { DEFAULT_TIMEZONE } from '@/lib/trade/tz'

export default async function ManualImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tier } = await getUserTier(user.id)
  const tradeCount = tier === 'Pro' ? 0 : await getUserTradeCount(user.id)

  // Default the AI-import timezone selector to the user's display preference.
  const { data: profile } = await supabase
    .from('User')
    .select('settings')
    .eq('id', user.id)
    .maybeSingle()
  const settings = (profile?.settings ?? {}) as { display?: { timezone?: string } }
  const defaultTimezone = settings.display?.timezone || DEFAULT_TIMEZONE

  return (
    <div className="p-4">
      <h1 className="sr-only">הזנת טריידים</h1>
      <ManualImportTabs
        userTier={tier}
        tradeCount={tradeCount}
        tradeLimit={MANUAL_TRADE_LIMIT_FREE}
        defaultTimezone={defaultTimezone}
      />
    </div>
  )
}
