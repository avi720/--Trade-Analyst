import { createClient } from '@/lib/supabase/server'
import { TradeSearch } from '@/components/trade-search'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const resolvedSearchParams = await searchParams
  const supabase = await createClient()

  const { data: trades } = await supabase
    .from('Trade')
    .select(
      'id, ticker, direction, status, source, closeReason, setupType, openedAt, closedAt, actualR, realizedPnl, totalCommission, result, notes, emotionalState, executionQuality, stopPrice, targetPrice, didRight, wouldChange, avgEntryPrice, avgExitPrice, totalQuantityOpened, totalQuantity'
    )
    .order('openedAt', { ascending: false })

  return (
    <>
      <h1 className="sr-only">חיפוש</h1>
      <TradeSearch trades={trades ?? []} initialParams={resolvedSearchParams} />
    </>
  )
}
