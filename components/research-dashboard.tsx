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

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  loadBoolPref,
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
  const router = useRouter()
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
  const [filterCollapsed, setFilterCollapsed] = useState(false)
  const [metricsCollapsed, setMetricsCollapsed] = useState(false)

  // Brief visual transition when any filter changes — gives the user
  // a visible confirmation that the data updated, even though the
  // recomputation is instant (synchronous useMemo). Skip the initial mount.
  const [transitioning, setTransitioning] = useState(false)
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    setTransitioning(true)
    const t = setTimeout(() => setTransitioning(false), 300)
    return () => clearTimeout(t)
  }, [dateFrom, dateTo, tickerFilter, setupFilter, directionFilter, resultFilter,
      execQualMin, execQualMax, holdHoursMin, holdHoursMax, holdUnit, rMin, rMax])

  // Hydrate persisted preferences after mount (localStorage is browser-only).
  useEffect(() => {
    setChartVisible(loadChartVisibility())
    setHoldUnit(loadHoldUnit())
    setSetupSeries(loadSetupSeries())
    setRowRatios(loadRowRatios())
    setFilterCollapsed(loadBoolPref(LS_KEYS.filterCollapsed))
    setMetricsCollapsed(loadBoolPref(LS_KEYS.metricsCollapsed))
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.filterCollapsed, String(filterCollapsed)) } catch {}
  }, [filterCollapsed])

  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.metricsCollapsed, String(metricsCollapsed)) } catch {}
  }, [metricsCollapsed])

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

  const uniqueTickers = useMemo(
    () => Array.from(new Set(closedTrades.map(t => t.ticker))).sort(),
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
    const timeout = setTimeout(() => {
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
    }, 300)
    return () => clearTimeout(timeout)
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

  /** Build a /search URL that mirrors the current research filters, plus any
   *  KPI-specific extra filter (e.g. result=Win for the win-rate card). */
  function buildSearchUrl(extra?: Record<string, string>): string {
    const params = new URLSearchParams()
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    if (tickerFilter) params.set('q', tickerFilter)
    if (setupFilter !== 'all') params.set('setup', setupFilter)
    if (directionFilter !== 'all') params.set('direction', directionFilter)
    if (resultFilter !== 'all') params.set('result', resultFilter)
    if (rMin) params.set('rMin', rMin)
    if (rMax) params.set('rMax', rMax)
    if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v)
    const qs = params.toString()
    return qs ? `/search?${qs}` : '/search'
  }

  function drillDown(extra?: Record<string, string>) {
    router.push(buildSearchUrl(extra))
  }

  const hasActiveFilter =
    !!(dateFrom || dateTo || tickerFilter || setupFilter !== 'all' || directionFilter !== 'all' ||
       resultFilter !== 'all' || execQualMin || execQualMax || holdHoursMin || holdHoursMax ||
       rMin || rMax)

  // Metric card color helpers
  const winRateColor =
    stats.totalTrades === 0 ? 'text-text-main' :
    stats.winRate >= 0.5    ? 'text-green' :
    stats.winRate >= 0.4    ? 'text-amber' : 'text-red'

  const pfColor =
    stats.totalTrades === 0 ? 'text-text-main' :
    stats.profitFactor >= 1.5 ? 'text-green' :
    stats.profitFactor < 1    ? 'text-red' : 'text-amber'

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
          tickers={uniqueTickers}
          hasActiveFilter={hasActiveFilter}
          collapsed={filterCollapsed}
          onToggleCollapsed={() => setFilterCollapsed(c => !c)}
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

        {/* Short live-region status string — announces only the trade count when
            filters change, instead of re-announcing the entire metrics + charts
            DOM (which is over 1000 chars). The dashboard content below is
            outside the live region. */}
        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {stats.totalTrades === 0
            ? 'אין תוצאות עבור הסינון הנוכחי'
            : `מציג ${stats.totalTrades} טריידים`}
        </p>

        <div className={'transition-opacity duration-300 ' + (transitioning ? 'opacity-60' : 'opacity-100')}>

        {/* ── Metrics row ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setMetricsCollapsed(c => !c)}
            aria-expanded={!metricsCollapsed}
            aria-label={metricsCollapsed ? 'הצג מדדים' : 'הסתר מדדים'}
            className="text-text-dim hover:text-text-main transition-colors text-xs font-sans flex items-center gap-1 px-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
          >
            <span aria-hidden="true">{metricsCollapsed ? '▼' : '▲'}</span>
            <span>{metricsCollapsed ? 'הצג מדדים' : 'הסתר מדדים'}</span>
          </button>
          {metricsCollapsed && stats.totalTrades > 0 && (
            <span className="text-sm font-mono">
              <span className="text-text-dim ml-2">סה״כ P&L:</span>
              <span className={stats.totalPnl > 0 ? 'text-green' : stats.totalPnl < 0 ? 'text-red' : 'text-text-main'}>
                {ltr(formatUsd(stats.totalPnl))}
              </span>
            </span>
          )}
        </div>
        {!metricsCollapsed && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricCard
            label="טריידים"
            value={String(stats.totalTrades)}
            info={METRIC_INFO.totalTrades}
            onClick={() => drillDown()}
          />
          <MetricCard
            label="אחוז הצלחה"
            value={stats.totalTrades === 0 ? '—' : `${(stats.winRate * 100).toFixed(1)}%`}
            color={winRateColor}
            info={METRIC_INFO.winRate}
            onClick={() => drillDown({ result: 'Win' })}
          />
          <MetricCard
            label="R ממוצע"
            value={stats.rTradeCount === 0 ? '—' : `${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`}
            color={stats.rTradeCount === 0 ? undefined : stats.avgR > 0 ? 'text-green' : stats.avgR < 0 ? 'text-red' : 'text-text-main'}
            info={METRIC_INFO.avgR}
            onClick={() => drillDown()}
          />
          <MetricCard
            label="Profit Factor"
            value={stats.totalTrades === 0 ? '—' : stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)}
            color={pfColor}
            info={METRIC_INFO.profitFactor}
            onClick={() => drillDown()}
          />
          <MetricCard
            label="Expectancy"
            value={stats.rTradeCount === 0 ? '—' : `${stats.expectancy >= 0 ? '+' : ''}${stats.expectancy.toFixed(2)}R`}
            color={stats.rTradeCount === 0 ? undefined : stats.expectancy > 0 ? 'text-green' : 'text-red'}
            info={METRIC_INFO.expectancy}
            onClick={() => drillDown()}
          />
          <MetricCard
            label="Max Drawdown"
            value={stats.totalTrades === 0 ? '—' : formatUsd(stats.maxDrawdown)}
            color={stats.maxDrawdown < 0 ? 'text-red' : 'text-text-main'}
            info={METRIC_INFO.maxDrawdown}
            onClick={() => drillDown({ result: 'Loss' })}
          />
          <MetricCard
            label="סה״כ P&L"
            value={stats.totalTrades === 0 ? '—' : formatUsd(stats.totalPnl)}
            color={stats.totalPnl > 0 ? 'text-green' : stats.totalPnl < 0 ? 'text-red' : 'text-text-main'}
            info={METRIC_INFO.totalPnl}
            onClick={() => drillDown()}
          />
          <dl
            className="panel p-4 cursor-pointer hover:ring-1 hover:ring-amber/40 transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
            role="button"
            tabIndex={0}
            title="פתח בדף החיפוש"
            onClick={() => drillDown()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillDown() } }}
          >
            <dt className="text-text-dim text-xs font-sans mb-1 tracking-wide flex items-center justify-between gap-2">
              <span>ממוצע רווח / הפסד</span>
              <span onClick={e => e.stopPropagation()}>
                <InfoTooltip label="מידע על ממוצע רווח / הפסד">{METRIC_INFO.avgWinLoss}</InfoTooltip>
              </span>
            </dt>
            <dd className="text-2xl font-mono font-bold m-0 flex items-center justify-between gap-2">
              <span className="truncate">
                {stats.totalTrades === 0 ? (
                  <span className="text-text-main">—</span>
                ) : (
                  <>
                    <span className="text-green">{ltr(formatUsd(stats.avgWin))}</span>
                    <span className="text-text-dim mx-1">/</span>
                    <span className="text-red">{ltr(formatUsd(stats.avgLoss))}</span>
                  </>
                )}
              </span>
              <span aria-hidden="true" className="text-text-mute font-mono text-base shrink-0">›</span>
            </dd>
          </dl>
        </div>
        )}

        {/* ── Chart visibility toggle ──────────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-text-dim text-sm font-sans">גרפים מוצגים:</span>
          <button
            onClick={() => setTogglePanelOpen(p => !p)}
            aria-expanded={togglePanelOpen}
            aria-label={togglePanelOpen ? 'סגור עריכת גרפים מוצגים' : 'ערוך גרפים מוצגים'}
            className="text-amber text-xs font-sans hover:opacity-80 transition-opacity rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
          >
            {togglePanelOpen ? <>סגור <span aria-hidden="true">✕</span></> : <>ערוך <span aria-hidden="true">✎</span></>}
          </button>
          <button
            onClick={resetChartSizes}
            aria-label="אפס גדלי גרפים לברירת מחדל"
            className="text-text-dim text-sm font-sans hover:text-amber transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
          >
            אפס גדלים ↺
          </button>
          {togglePanelOpen && CHART_IDS.map(id => (
            <label key={id} className="flex items-center gap-1.5 cursor-pointer text-sm font-sans text-text-main">
              <input
                type="checkbox"
                checked={chartVisible[id]}
                onChange={e => setChartVisible(prev => ({ ...prev, [id]: e.target.checked }))}
                className="accent-amber"
              />
              {CHART_LABELS[id]}
            </label>
          ))}
        </div>

        {/* ── Charts / empty state ─────────────────────────────────────────────── */}
        {filteredTrades.length === 0 ? (
          closedTrades.length === 0 ? (
            <div className="panel p-12 text-center" role="status">
              <h2 className="text-text-main font-sans text-xl font-semibold mb-3">
                עוד אין כאן טריידים — בוא נתחיל
              </h2>
              <p className="text-text-dim font-sans text-base mb-8 max-w-md mx-auto">
                כדי לראות אנליטיקה ותובנות, קודם צריך להזין טריידים. שתי דרכים להתחיל:
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto">
                <a
                  href="/manual-import"
                  className="inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium bg-amber text-bg-dark hover:bg-amber/90 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
                >
                  ייבא עסקאות ידני
                </a>
                <a
                  href="/profile?tab=broker"
                  className="inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium border border-border bg-panel-bg text-text-main hover:border-amber hover:text-amber transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
                >
                  חבר את Interactive Brokers
                </a>
              </div>
              <p className="text-text-dim font-sans text-xs mt-6">
                חיבור ל-IBKR זמין במסלול Pro
              </p>
            </div>
          ) : (
            <div className="panel p-16 text-center" role="status">
              <p className="text-text-dim font-sans text-base">
                אין טריידים סגורים בטווח זה
              </p>
            </div>
          )
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
