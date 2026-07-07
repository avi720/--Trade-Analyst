import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getUserTier,
  getUserTradeCount,
  MANUAL_TRADE_LIMIT_FREE,
} from '@/lib/billing/tier'
import { ManualImportTabs } from '@/components/manual-import-tabs'

export default async function ManualImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tier } = await getUserTier(user.id)
  const tradeCount = tier === 'Pro' ? 0 : await getUserTradeCount(user.id)

  return (
    <div className="p-4">
      <h1 className="sr-only">הזנת טריידים</h1>
      <ManualImportTabs
        userTier={tier}
        tradeCount={tradeCount}
        tradeLimit={MANUAL_TRADE_LIMIT_FREE}
      />
    </div>
  )
}
