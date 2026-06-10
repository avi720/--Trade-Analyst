/**
 * Research dashboard — entry point.
 *
 * Owns the page-level state (filters, chart visibility, persisted sizes) and
 * orchestrates the four extracted modules:
 *   - lib.ts             — types, constants, localStorage helpers, row grouping
 *   - shell.tsx          — ChartCard, PairRow, MetricCard, DayHourInner primitives
 *   - charts.tsx         — renderChart() for the six chart bodies
 *   - filter-bar.tsx     — FilterBar component
 *
 * Was 1237 lines in a single file before T11 of docs/TECH-DEBT.md.
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useChatContext } from '@/lib/chat/chat-context'
import { calcStats, equityCurve, rDistribution, setupPerformance } from '@/lib/utils/calculations'
import { pnlByTicker, holdTimeVsR, pnlByDayOfWeek, pnlByHour } from '@/lib/utils/research-charts'
import { formatUsd } from '@/lib/utils/position-calc'
import { InfoTooltip } from '@/components/info-tooltip'
import { METRIC_INFO } from '@/components/research-info'
import {
  CHART_IDS,
  CHART_LABELS,
  LS_KEYS,
  defaultVisibility,
  defaultSetupSeries,
  groupChartsIntoRows,
  loadChartVisibility,
  loadHoldUnit,
  loadSetupSeries,
  loadRowRatios,
  saveRowRatio,
  toClosedTrade,
  type ChartId,
  type HoldUnit,
  type SetupSeries,
  type RawClosedTrade,
} from './research/lib'
import { MetricCard, PairRow, ltr } from './research/shell'
import { renderChart, type ChartData } from './research/charts'
import { FilterBar } from './research/filter-bar'

interface Props {
  trades: RawClosedTrade[]
}

// Re-export the raw row type — the server-rendered page (app/(dashboard)/research/page.tsx) consumes it.
export type { RawClosedTrade }

export function ResearchDashboard({ trades: rawTrades }: Props) {
  const { setContextData } = useChatContext()
  const [togglePanelOpen, setTogglePanelOpen] = useState(false)
  const [chartVisible, setChartVisible] = useState<Record<ChartId, boolean>>(defaultVisibility)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [tickerFilter, setTickerFilter] = useState('')
  const [setupFilter, setSetupFilter] = useState('all')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [resultFilter, setResultFilter] = useState('all')
  const [execQualMin, setExecQualMin] = useState('')
  const [execQualMax, setExecQualMax] = useState('')
  const [holdHoursMin, setHoldHoursMin] = useState('')
  const [holdHoursMax, setHoldHoursMax] = useState('')
  const [rMin, setRMin] = useState('')
  const [rMax, setRMax] = useState('')
  const [holdUnit, setHoldUnit] = useState<HoldUnit>('hours')
  const [setupSeries, setSetupSeries] = useState<SetupSeries>(defaultSetupSeries)
  const [rowRatios, setRowRatios] = useState<Record<string, number>>({})
  const [resetKey, setResetKey] = useState(0)

  // Hydrate persisted preferences after mount (localStorage is browser-only).
  useEffect(() => {
    setChartVisible(loadChartVisibility())
    setHoldUnit(loadHoldUnit())
    setSetupSeries(loadSetupSeries())
    setRowRatios(loadRowRatios())
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.visibility, JSON.stringify(chartVisible)) } catch {}
  }, [chartVisible])

  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.holdUnit, holdUnit) } catch {}
  }, [holdUnit])

  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.setupSeries, JSON.stringify(setupSeries)) } catch {}
  }, [setupSeries])

  const closedTrades = useMemo(
    () => rawTrades.flatMap(t => { const ct = toClosedTrade(t); return ct ? [ct] : [] }),
    [rawTrades],
  )

  const setupTypes = useMemo(
    () => Array.from(new Set(closedTrades.map(t => t.setupType).filter(Boolean))) as string[],
    [closedTrades],
  )

  const filteredTrades = useMemo(() => {
    // Parse the YYYY-MM-DD inputs as boundaries in the BROWSER's local timezone
    // (matching the user's session and the day/hour chart). `new Date('YYYY-MM-DD')`
    // parses as UTC midnight, which on negative-UTC offsets pushes the boundary
    // a day earlier than the user expects; constructing via numeric components
    // pins the boundary to local wall-clock midnight / 23:59:59.999.
    const parseLocalStart = (s: string): Date | null => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
      if (!m) return null
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
    }
    const parseLocalEnd = (s: string): Date | null => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
      if (!m) return null
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999)
    }
    const fromDate = dateFrom ? parseLocalStart(dateFrom) : null
    const toDate = dateTo ? parseLocalEnd(dateTo) : null
    return closedTrades.filter(t => {
      if (fromDate && t.openedAt < fromDate) return false
      if (toDate && t.openedAt > toDate) return false
      if (tickerFilter && !t.ticker.toUpperCase().includes(tickerFilter.toUpperCase())) return false
      if (setupFilter !== 'all' && t.setupType !== setupFilter) return false
      if (directionFilter !== 'all' && t.direction !== directionFilter) return false
      if (resultFilter !== 'all' && t.result !== resultFilter) return false
      if (execQualMin !== '' && (t.executionQuality ?? 0) < Number(execQualMin)) return false
      if (execQualMax !== '' && (t.executionQuality ?? 10) > Number(execQualMax)) return false
      if (rMin !== '' && (t.actualR == null || t.actualR < Number(rMin))) return false
      if (rMax !== '' && (t.actualR == null || t.actualR > Number(rMax))) return false
      if (holdHoursMin !== '' || holdHoursMax !== '') {
        const hrs = (t.closedAt.getTime() - t.openedAt.getTime()) / 3_600_000
        // Input values are interpreted in the selected unit; convert to hours for comparison.
        const factor = holdUnit === 'days' ? 24 : 1
        if (holdHoursMin !== '' && hrs < Number(holdHoursMin) * factor) return false
        if (holdHoursMax !== '' && hrs > Number(holdHoursMax) * factor) return false
      }
      return true
    })
  }, [closedTrades, dateFrom, dateTo, tickerFilter, setupFilter, directionFilter, resultFilter,
      execQualMin, execQualMax, holdHoursMin, holdHoursMax, holdUnit, rMin, rMax])

  const stats = useMemo(() => calcStats(filteredTrades), [filteredTrades])

  useEffect(() => {
    setContextData({
      source: 'research',
      tradeCount: stats.totalTrades,
      winRate: stats.winRate,
      avgR: stats.avgR,
      expectancy: stats.expectancy,
      totalPnl: stats.totalPnl,
      maxDrawdown: stats.maxDrawdown,
      profitFactor: stats.profitFactor,
      trades: filteredTrades.map(t => ({
        ticker: t.ticker,
        direction: t.direction,
        actualR: t.actualR,
        result: t.result,
        setup: t.setupType,
        closedAt: t.closedAt?.toISOString() ?? null,
      })),
    })
  }, [filteredTrades, stats, setContextData])

  const chartData: ChartData = useMemo(() => {
    const allHold = holdTimeVsR(filteredTrades)
    return {
      equity:    equityCurve(filteredTrades),
      rdist:     rDistribution(filteredTrades),
      setup:     setupPerformance(filteredTrades),
      ticker:    pnlByTicker(filteredTrades),
      holdWins:  allHold.filter(p => p.result === 'Win'),
      holdLoss:  allHold.filter(p => p.result === 'Loss'),
      holdOther: allHold.filter(p => p.result !== 'Win' && p.result !== 'Loss'),
      dayofweek: pnlByDayOfWeek(filteredTrades),
      hour:      pnlByHour(filteredTrades),
    }
  }, [filteredTrades])

  const chartRows = useMemo(() => groupChartsIntoRows(chartVisible), [chartVisible])

  function handleRatioCommit(pairKey: string, ratio: number) {
    setRowRatios(prev => ({ ...prev, [pairKey]: ratio }))
    saveRowRatio(pairKey, ratio)
  }

  function resetChartSizes() {
    try { localStorage.removeItem(LS_KEYS.chartHeights) } catch {}
    try { localStorage.removeItem(LS_KEYS.rowRatios) } catch {}
    setRowRatios({})
    setResetKey(k => k + 1)
  }

  function resetFilters() {
    setDateFrom(''); setDateTo(''); setTickerFilter(''); setSetupFilter('all')
    setDirectionFilter('all'); setResultFilter('all')
    setExecQualMin(''); setExecQualMax(''); setHoldHoursMin(''); setHoldHoursMax('')
    setRMin(''); setRMax('')
  }

  const hasActiveFilter =
    !!(dateFrom || dateTo || tickerFilter || setupFilter !== 'all' || directionFilter !== 'all' ||
       resultFilter !== 'all' || execQualMin || execQualMax || holdHoursMin || holdHoursMax ||
       rMin || rMax)

  // Metric card color helpers
  const winRateColor =
    stats.totalTrades === 0 ? 'text-[#E0E0E0]' :
    stats.winRate >= 0.5    ? 'text-[#2CC84A]' :
    stats.winRate >= 0.4    ? 'text-[#FFB800]' : 'text-[#FF4D4D]'

  const pfColor =
    stats.totalTrades === 0 ? 'text-[#E0E0E0]' :
    stats.profitFactor >= 1.5 ? 'text-[#2CC84A]' :
    stats.profitFactor < 1    ? 'text-[#FF4D4D]' : 'text-[#FFB800]'

  const tickerDefaultHeight = Math.max(220, chartData.ticker.length * 28 + 40)

  function chartDefaultHeight(id: ChartId): number {
    if (id === 'ticker') return tickerDefaultHeight
    if (id === 'dayhour') return 360
    return 220
  }

  function renderOne(id: ChartId, defaultHeightOverride?: number): React.ReactElement {
    return renderChart({
      id,
      data: chartData,
      defaultHeight: defaultHeightOverride ?? chartDefaultHeight(id),
      setupSeries,
      onSetupSeriesChange: setSetupSeries,
    })
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full relative">
      {/* Inner region (not <main> — the dashboard layout already provides the single main landmark) */}
      <div className="flex-1 overflow-auto p-6" dir="rtl">

        <FilterBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          tickerFilter={tickerFilter}
          setupFilter={setupFilter}
          directionFilter={directionFilter}
          resultFilter={resultFilter}
          execQualMin={execQualMin}
          execQualMax={execQualMax}
          holdHoursMin={holdHoursMin}
          holdHoursMax={holdHoursMax}
          holdUnit={holdUnit}
          rMin={rMin}
          rMax={rMax}
          setupTypes={setupTypes}
          hasActiveFilter={hasActiveFilter}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onTickerChange={setTickerFilter}
          onSetupChange={setSetupFilter}
          onDirectionChange={setDirectionFilter}
          onResultChange={setResultFilter}
          onExecQualMinChange={setExecQualMin}
          onExecQualMaxChange={setExecQualMax}
          onHoldMinChange={setHoldHoursMin}
          onHoldMaxChange={setHoldHoursMax}
          onHoldUnitChange={setHoldUnit}
          onRMinChange={setRMin}
          onRMaxChange={setRMax}
          onReset={resetFilters}
        />

        {/* Results region — announces metric/chart updates to screen readers when filters change */}
        <div aria-live="polite" aria-atomic="false">

        {/* ── Metrics row ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricCard label="טריידים" value={String(stats.totalTrades)} info={METRIC_INFO.totalTrades} />
          <MetricCard
            label="אחוז הצלחה"
            value={stats.totalTrades === 0 ? '—' : `${(stats.winRate * 100).toFixed(1)}%`}
            color={winRateColor}
            info={METRIC_INFO.winRate}
          />
          <MetricCard
            label="R ממוצע"
            value={stats.rTradeCount === 0 ? '—' : `${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`}
            color={stats.rTradeCount === 0 ? undefined : stats.avgR > 0 ? 'text-[#2CC84A]' : stats.avgR < 0 ? 'text-[#FF4D4D]' : 'text-[#E0E0E0]'}
            info={METRIC_INFO.avgR}
          />
          <MetricCard
            label="Profit Factor"
            value={stats.totalTrades === 0 ? '—' : stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)}
            color={pfColor}
            info={METRIC_INFO.profitFactor}
          />
          <MetricCard
            label="Expectancy"
            value={stats.rTradeCount === 0 ? '—' : `${stats.expectancy >= 0 ? '+' : ''}${stats.expectancy.toFixed(2)}R`}
            color={stats.rTradeCount === 0 ? undefined : stats.expectancy > 0 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}
            info={METRIC_INFO.expectancy}
          />
          <MetricCard
            label="Max Drawdown"
            value={stats.totalTrades === 0 ? '—' : formatUsd(stats.maxDrawdown)}
            color={stats.maxDrawdown < 0 ? 'text-[#FF4D4D]' : 'text-[#E0E0E0]'}
            info={METRIC_INFO.maxDrawdown}
          />
          <MetricCard
            label="סה״כ P&L"
            value={stats.totalTrades === 0 ? '—' : formatUsd(stats.totalPnl)}
            color={stats.totalPnl > 0 ? 'text-[#2CC84A]' : stats.totalPnl < 0 ? 'text-[#FF4D4D]' : 'text-[#E0E0E0]'}
            info={METRIC_INFO.totalPnl}
          />
          <dl className="panel p-4">
            <dt className="text-[#B0B0B0] text-sm font-sans mb-1 flex items-center justify-between gap-2">
              <span>ממוצע רווח / הפסד</span>
              <InfoTooltip label="מידע על ממוצע רווח / הפסד">{METRIC_INFO.avgWinLoss}</InfoTooltip>
            </dt>
            {stats.totalTrades === 0 ? (
              <dd className="text-[#E0E0E0] text-xl font-mono font-bold m-0">—</dd>
            ) : (
              <dd className="text-xl font-mono font-bold m-0 truncate">
                <span className="text-[#2CC84A]">{ltr(formatUsd(stats.avgWin))}</span>
                <span className="text-[#B0B0B0] mx-1">/</span>
                <span className="text-[#FF4D4D]">{ltr(formatUsd(stats.avgLoss))}</span>
              </dd>
            )}
          </dl>
        </div>

        {/* ── Chart visibility toggle ──────────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[#B0B0B0] text-sm font-sans">גרפים מוצגים:</span>
          <button
            onClick={() => setTogglePanelOpen(p => !p)}
            aria-expanded={togglePanelOpen}
            aria-label={togglePanelOpen ? 'סגור עריכת גרפים מוצגים' : 'ערוך גרפים מוצגים'}
            className="text-[#FFB800] text-xs font-sans hover:opacity-80 transition-opacity rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFB800] focus-visible:outline-offset-2"
          >
            {togglePanelOpen ? <>סגור <span aria-hidden="true">✕</span></> : <>ערוך <span aria-hidden="true">✎</span></>}
          </button>
          <button
            onClick={resetChartSizes}
            aria-label="אפס גדלי גרפים לברירת מחדל"
            className="text-[#B0B0B0] text-sm font-sans hover:text-[#FFB800] transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFB800] focus-visible:outline-offset-2"
          >
            אפס גדלים ↺
          </button>
          {togglePanelOpen && CHART_IDS.map(id => (
            <label key={id} className="flex items-center gap-1.5 cursor-pointer text-sm font-sans text-[#E0E0E0]">
              <input
                type="checkbox"
                checked={chartVisible[id]}
                onChange={e => setChartVisible(prev => ({ ...prev, [id]: e.target.checked }))}
                className="accent-[#FFB800]"
              />
              {CHART_LABELS[id]}
            </label>
          ))}
        </div>

        {/* ── Charts / empty state ─────────────────────────────────────────────── */}
        {filteredTrades.length === 0 ? (
          <div className="panel p-16 text-center" role="status">
            <p className="text-[#B0B0B0] font-sans text-base">
              {closedTrades.length === 0
                ? 'אין טריידים סגורים במערכת'
                : 'אין טריידים סגורים בטווח זה'}
            </p>
          </div>
        ) : (
          <div key={resetKey} className="flex flex-col gap-4">
            {chartRows.map((row) => {
              if (row.type === 'pair') {
                const ratio = rowRatios[row.pairKey] ?? 0.5
                const [a, b] = row.chartIds
                const pairDh = Math.max(chartDefaultHeight(a), chartDefaultHeight(b))
                return (
                  <PairRow key={row.pairKey} pairKey={row.pairKey} initialRatio={ratio} onRatioCommit={handleRatioCommit}>
                    {renderOne(a, pairDh)}
                    {renderOne(b, pairDh)}
                  </PairRow>
                )
              }
              const id = row.chartId
              return <div key={id}>{renderOne(id)}</div>
            })}
          </div>
        )}
        </div>
        {/* /aria-live results region */}
      </div>

    </div>
  )
}
