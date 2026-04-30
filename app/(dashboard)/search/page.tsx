import { createClient } from '@/lib/supabase/server'
import { TradeSearch } from '@/components/trade-search'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Record<string, string>
}) {
  const supabase = await createClient()

  const { data: trades } = await supabase
    .from('Trade')
    .select(
      'id, ticker, direction, status, setupType, openedAt, closedAt, actualR, realizedPnl, totalCommission, result, notes, emotionalState, executionQuality, stopPrice, targetPrice, didRight, wouldChange, avgEntryPrice, avgExitPrice, totalQuantityOpened'
    )
    .order('openedAt', { ascending: false })

  return <TradeSearch trades={trades ?? []} initialParams={searchParams} />
}
