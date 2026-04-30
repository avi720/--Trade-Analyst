'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useChatContext } from '@/lib/chat/chat-context'
import {
  unrealizedPnl,
  unrealizedPct,
  currentR,
  exposure,
  relativeTimeHe,
  formatUsd,
  formatR,
  type OpenPositionTrade,
} from '@/lib/utils/position-calc'

// Subset of Trade row returned by server component
export interface OpenTrade {
  id: string
  ticker: string
  direction: string
  avgEntryPrice: number
  totalQuantity: number
  stopPrice: number | null
  targetPrice: number | null
  lastKnownPrice: number | null
  lastPriceUpdateAt: string | null
  setupType: string | null
  openedAt: string
  realizedPnl: number | null
  totalCommission: number | null
}

export interface ConnectionStatus {
  lastSyncAt: string | null
  lastSyncStatus: string | null
  pollingIntervalMin: number
  lastPriceSyncAt: string | null
  lastPriceSyncStatus: string | null
  pricePollingIntervalMin: number
}

interface Props {
  trades: OpenTrade[]
  connection: ConnectionStatus | null
}

type DirectionFilter = 'all' | 'Long' | 'Short'
type PnlFilter = 'all' | 'profit' | 'loss'

function toCalcTrade(t: OpenTrade): OpenPositionTrade {
  return {
    direction: t.direction as 'Long' | 'Short',
    avgEntryPrice: t.avgEntryPrice,
    totalQuantity: t.totalQuantity,
    stopPrice: t.stopPrice,
    lastKnownPrice: t.lastKnownPrice,
  }
}

function relativeOpen(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}d'`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

function priceStaleMinutes(lastPriceUpdateAt: string | null, intervalMin: number): boolean {
  if (!lastPriceUpdateAt) return false
  const ms = Date.now() - new Date(lastPriceUpdateAt).getTime()
  return ms > intervalMin * 60_000
}

export function OpenPositionsDashboard({ trades, connection }: Props) {
  const router = useRouter()
  const { setContextData } = useChatContext()
  const [refreshing, setRefreshing] = useState(false)
  const [tickerFilter, setTickerFilter] = useState('')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all')
  const [setupFilter, setSetupFilter] = useState('all')
  const [pnlFilter, setPnlFilter] = useState<PnlFilter>('all')

  // Auto-trigger price refresh if prices are stale on mount
  useEffect(() => {
    if (!connection) return
    const sinceSync = Date.now() - new Date(connection.lastPriceSyncAt ?? 0).getTime()
    const intervalMs = connection.pricePollingIntervalMin * 60_000
    if (sinceSync > intervalMs) {
      fetch('/api/massive/refresh', { method: 'POST' })
        .then(() => router.refresh())
        .catch(() => {/* silent — cron will catch up */})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setContextData({
      source: 'positions',
      openPositions: trades.map(t => ({
        ticker: t.ticker,
        direction: t.direction,
        unrealizedPnl: unrealizedPnl(toCalcTrade(t)),
        currentR: currentR(toCalcTrade(t)),
        holdDays: Math.floor((Date.now() - new Date(t.openedAt).getTime()) / 86_400_000),
      })),
    })
  }, [trades, setContextData])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetch('/api/massive/refresh', { method: 'POST' })
      router.refresh()
    } finally {
      setRefreshing(false)
    }
  }, [router])

  // Unique setup types for filter dropdown
  const setupTypes = Array.from(new Set(trades.map(t => t.setupType).filter(Boolean))) as string[]

  // Apply filters
  const filtered = trades.filter(t => {
    if (tickerFilter && !t.ticker.toUpperCase().includes(tickerFilter.toUpperCase())) return false
    if (directionFilter !== 'all' && t.direction !== directionFilter) return false
    if (setupFilter !== 'all' && t.setupType !== setupFilter) return false
    if (pnlFilter !== 'all') {
      const pnl = unrealizedPnl(toCalcTrade(t))
      if (pnlFilter === 'profit' && (pnl === null || pnl <= 0)) return false
      if (pnlFilter === 'loss' && (pnl === null || pnl >= 0)) return false
    }
    return true
  })

  // Summary calculations
  const totalExposure = filtered.reduce((sum, t) => sum + exposure(toCalcTrade(t)), 0)
  const totalUnrealizedPnl = filtered.reduce((sum, t) => {
    const pnl = unrealizedPnl(toCalcTrade(t))
    return sum + (pnl ?? 0)
  }, 0)

  // IBKR stale check: amber if > 2× polling interval
  const ibkrStale =
    connection?.lastSyncAt
      ? Date.now() - new Date(connection.lastSyncAt).getTime() >
        2 * (connection.pollingIntervalMin ?? 15) * 60_000
      : false

  return (
    <div className="flex h-full relative">
      {/* Main content */}
      <main className="flex-1 overflow-auto p-6" dir="rtl">
        {/* IBKR stale banner */}
        {ibkrStale && (
          <div className="mb-4 px-4 py-3 rounded border border-[#FFB800] bg-[#FFB80010] text-[#FFB800] text-sm font-sans flex items-center gap-2">
            <span>⚠️</span>
            <span>לא סונכרן לאחרונה עם IBKR — בדוק את Flex Query בהגדרות</span>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="panel p-4">
            <p className="text-[#888888] text-xs font-sans mb-1">פוזיציות פתוחות</p>
            <p className="text-[#E0E0E0] text-2xl font-mono font-bold">{filtered.length}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[#888888] text-xs font-sans mb-1">Exposure כולל</p>
            <p className="text-[#E0E0E0] text-2xl font-mono font-bold">
              ${totalExposure.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="panel p-4">
            <p className="text-[#888888] text-xs font-sans mb-1">P&L לא ממומש</p>
            <p
              className={`text-2xl font-mono font-bold ${
                totalUnrealizedPnl >= 0 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'
              }`}
            >
              {formatUsd(totalUnrealizedPnl)}
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input
            type="text"
            placeholder="סינון לפי טיקר..."
            value={tickerFilter}
            onChange={e => setTickerFilter(e.target.value)}
            className="input-base w-36 text-sm font-mono"
            dir="ltr"
          />

          <select
            value={directionFilter}
            onChange={e => setDirectionFilter(e.target.value as DirectionFilter)}
            className="input-base text-sm font-sans"
          >
            <option value="all">כיוון: הכל</option>
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>

          {setupTypes.length > 0 && (
            <select
              value={setupFilter}
              onChange={e => setSetupFilter(e.target.value)}
              className="input-base text-sm font-sans"
            >
              <option value="all">סטאפ: הכל</option>
              {setupTypes.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          <select
            value={pnlFilter}
            onChange={e => setPnlFilter(e.target.value as PnlFilter)}
            className="input-base text-sm font-sans"
          >
            <option value="all">P&L: הכל</option>
            <option value="profit">רווח בלבד</option>
            <option value="loss">הפסד בלבד</option>
          </select>

          {/* Spacer + refresh button */}
          <div className="flex-1" />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-ghost px-3 py-1.5 text-sm font-sans border border-[#333333] rounded disabled:opacity-50"
          >
            {refreshing ? '...' : 'עדכן מחירים'}
          </button>
        </div>

        {/* Positions table */}
        {filtered.length === 0 ? (
          <div className="panel p-12 text-center">
            <p className="text-[#888888] font-sans text-base">
              {trades.length === 0 ? 'אין פוזיציות פתוחות' : 'אין תוצאות לפי הסינון הנוכחי'}
            </p>
          </div>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm" style={{ direction: 'rtl' }}>
              <thead>
                <tr className="border-b border-[#222222] text-[#888888] font-sans text-xs">
                  <th className="text-right px-4 py-3 font-normal">טיקר</th>
                  <th className="text-right px-4 py-3 font-normal">כיוון</th>
                  <th className="text-right px-4 py-3 font-normal">כמות</th>
                  <th className="text-right px-4 py-3 font-normal">כניסה ממוצעת</th>
                  <th className="text-right px-4 py-3 font-normal">מחיר נוכחי</th>
                  <th className="text-right px-4 py-3 font-normal">P&L לא ממומש</th>
                  <th className="text-right px-4 py-3 font-normal">R נוכחי</th>
                  <th className="text-right px-4 py-3 font-normal">זמן פתוח</th>
                  <th className="text-right px-4 py-3 font-normal">סטאפ</th>
                  <th className="text-right px-4 py-3 font-normal">עדכון מחיר</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const ct = toCalcTrade(t)
                  const pnl = unrealizedPnl(ct)
                  const pct = unrealizedPct(ct)
                  const r = currentR(ct)
                  const priceStale = priceStaleMinutes(
                    t.lastPriceUpdateAt,
                    connection?.pricePollingIntervalMin ?? 15
                  )

                  return (
                    <tr
                      key={t.id}
                      className="border-b border-[#1A1A1A] hover:bg-[#151515] transition-colors"
                    >
                      {/* טיקר */}
                      <td className="px-4 py-3 font-mono font-bold text-[#E0E0E0]">
                        {t.ticker}
                      </td>

                      {/* כיוון */}
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                            t.direction === 'Long'
                              ? 'text-[#2CC84A] bg-[#2CC84A15]'
                              : 'text-[#FF4D4D] bg-[#FF4D4D15]'
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>

                      {/* כמות */}
                      <td className="px-4 py-3 font-mono text-[#E0E0E0]">
                        {t.totalQuantity.toLocaleString()}
                      </td>

                      {/* כניסה ממוצעת */}
                      <td className="px-4 py-3 font-mono text-[#E0E0E0]">
                        ${t.avgEntryPrice.toFixed(2)}
                      </td>

                      {/* מחיר נוכחי */}
                      <td className="px-4 py-3 font-mono text-[#E0E0E0]">
                        {t.lastKnownPrice !== null ? `$${t.lastKnownPrice.toFixed(2)}` : '—'}
                      </td>

                      {/* P&L לא ממומש */}
                      <td className="px-4 py-3 font-mono">
                        {pnl !== null ? (
                          <span className={pnl >= 0 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}>
                            {formatUsd(pnl)}
                            {pct !== null && (
                              <span className="text-xs mr-1 opacity-70">
                                ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[#888888]">—</span>
                        )}
                      </td>

                      {/* R נוכחי */}
                      <td className="px-4 py-3 font-mono">
                        {r !== null ? (
                          <span className={r >= 0 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}>
                            {formatR(r)}
                          </span>
                        ) : (
                          <span className="text-[#888888]">—</span>
                        )}
                      </td>

                      {/* זמן פתוח */}
                      <td className="px-4 py-3 font-mono text-[#888888]">
                        {relativeOpen(t.openedAt)}
                      </td>

                      {/* סטאפ */}
                      <td className="px-4 py-3 text-[#888888] font-sans text-xs">
                        {t.setupType ?? '—'}
                      </td>

                      {/* עדכון מחיר */}
                      <td
                        className={`px-4 py-3 font-sans text-xs ${
                          priceStale ? 'text-[#FFB800]' : 'text-[#888888]'
                        }`}
                      >
                        {relativeTimeHe(t.lastPriceUpdateAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

    </div>
  )
}
