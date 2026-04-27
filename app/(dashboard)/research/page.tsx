import { createClient } from '@/lib/supabase/server'
import { ResearchDashboard } from '@/components/research-dashboard'

export default async function ResearchPage() {
  const supabase = await createClient()

  const { data: rawTrades } = await supabase
    .from('Trade')
    .select(
      'id, ticker, direction, setupType, openedAt, closedAt, actualR, realizedPnl, avgEntryPrice, avgExitPrice, stopPrice, totalQuantityOpened, result, executionQuality'
    )
    .eq('status', 'Closed')
    .order('closedAt', { ascending: true })

  return <ResearchDashboard trades={(rawTrades ?? []) as Parameters<typeof ResearchDashboard>[0]['trades']} />
}
