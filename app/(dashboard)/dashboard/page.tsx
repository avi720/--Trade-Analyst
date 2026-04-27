import { createClient } from '@/lib/supabase/server'
import { OpenPositionsDashboard } from '@/components/open-positions-dashboard'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [tradesResult, connectionResult] = await Promise.all([
    supabase
      .from('Trade')
      .select(
        'id, ticker, direction, avgEntryPrice, totalQuantity, stopPrice, targetPrice, lastKnownPrice, lastPriceUpdateAt, setupType, openedAt, realizedPnl, totalCommission'
      )
      .eq('status', 'Open')
      .order('openedAt', { ascending: false }),
    supabase
      .from('BrokerConnection')
      .select(
        'lastSyncAt, lastSyncStatus, pollingIntervalMin, lastPriceSyncAt, lastPriceSyncStatus, pricePollingIntervalMin'
      )
      .maybeSingle(),
  ])

  return (
    <OpenPositionsDashboard
      trades={(tradesResult.data ?? []) as Parameters<typeof OpenPositionsDashboard>[0]['trades']}
      connection={connectionResult.data ?? null}
    />
  )
}
