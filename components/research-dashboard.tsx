'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  LineChart, Line,
  BarChart, Bar,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine,
} from 'recharts'
import { useChatContext } from '@/lib/chat/chat-context'
import { calcStats, equityCurve, rDistribution, setupPerformance } from '@/lib/utils/calculations'
import { pnlByTicker, holdTimeVsR, pnlByDayOfWeek, pnlByHour } from '@/lib/utils/research-charts'
import { formatUsd } from '@/lib/utils/position-calc'
import type { ClosedTrade } from '@/types/trade'

// Raw trade shape as serialized by the server component (dates as ISO strings)
export interface RawClosedTrade {
  id: string
  ticker: string
  direction: string
  setupType: string | null
  openedAt: string
  closedAt: string | null
  actualR: number | null
  realizedPnl: number | null
  avgEntryPrice: number
  avgExitPrice: number | null
  stopPrice: number | null
  totalQuantityOpened: number
  result: string | null
  executionQuality: number | null
}

interface Props {
  trades: RawClosedTrade[]
}

// Convert raw Supabase row → ClosedTrade; returns null when required fields are missing
function toClosedTrade(t: RawClosedTrade): ClosedTrade | null {
  if (t.realizedPnl == null || !t.closedAt) return null
  return {
    id: t.id,
    ticker: t.ticker,
    direction: t.direction as 'Long' | 'Short',
    setupType: t.setupType,
    openedAt: new Date(t.openedAt),
    closedAt: new Date(t.closedAt),
    actualR: t.actualR,
    realizedPnl: t.realizedPnl,
    avgEntryPrice: t.avgEntryPrice,
    avgExitPrice: t.avgExitPrice ?? null,
    stopPrice: t.stopPrice ?? null,
    totalQuantityOpened: t.totalQuantityOpened,
    result: t.result,
    executionQuality: t.executionQuality,
  }
}

// ─── Chart toggle constants ───────────────────────────────────────────────────

const CHART_IDS = ['equity', 'rdist', 'setup', 'ticker', 'holdtime', 'dayhour'] as const
type ChartId = typeof CHART_IDS[number]

const CHART_LABELS: Record<ChartId, string> = {
  equity:   'עקומת הון',
  rdist:    'התפלגות R',
  setup:    'ביצועי סטאפ',
  ticker:   'P&L לפי נייר',
  holdtime: 'זמן החזקה vs R',
  dayhour:  'P&L לפי יום/שעה',
}

const LS_KEY = 'research_charts_visible'
const LS_KEY_HOLD_UNIT = 'research_hold_unit'
const LS_KEY_SETUP_SERIES = 'research_setup_series'
const LS_KEY_CHART_HEIGHTS = 'research_chart_heights'

function defaultVisibility(): Record<ChartId, boolean> {
  return Object.fromEntries(CHART_IDS.map(id => [id, true])) as Record<ChartId, boolean>
}

function loadChartVisibility(): Record<ChartId, boolean> {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) return { ...defaultVisibility(), ...JSON.parse(stored) }
  } catch {}
  return defaultVisibility()
}

type HoldUnit = 'hours' | 'days'
function loadHoldUnit(): HoldUnit {
  try {
    const v = localStorage.getItem(LS_KEY_HOLD_UNIT)
    if (v === 'days' || v === 'hours') return v
  } catch {}
  return 'hours'
}

interface SetupSeries { avgR: boolean; winRate: boolean }
const defaultSetupSeries: SetupSeries = { avgR: true, winRate: true }
function loadSetupSeries(): SetupSeries {
  try {
    const v = localStorage.getItem(LS_KEY_SETUP_SERIES)
    if (v) return { ...defaultSetupSeries, ...JSON.parse(v) }
  } catch {}
  return defaultSetupSeries
}

function loadChartHeights(): Record<string, number> {
  try {
    const v = localStorage.getItem(LS_KEY_CHART_HEIGHTS)
    if (v) return JSON.parse(v)
  } catch {}
  return {}
}
function saveChartHeight(chartId: string, h: number) {
  try {
    const cur = loadChartHeights()
    cur[chartId] = h
    localStorage.setItem(LS_KEY_CHART_HEIGHTS, JSON.stringify(cur))
  } catch {}
}

// ─── Shared chart styling ─────────────────────────────────────────────────────

const TOOLTIP_STYLE: React.CSSProperties = {
  background: '#111111',
  border: '1px solid #333333',
  color: '#E0E0E0',
  fontSize: 12,
  borderRadius: 4,
}
const AXIS_TICK = { fill: '#888888', fontSize: 11 }
const GRID_STROKE = '#1E1E1E'
const AXIS_STROKE = '#333333'

// The dashboard renders inside dir="rtl". Numeric/currency/R labels contain weak
// bidi characters (-, +, $, <, >) that the RTL algorithm reorders, turning "-$2k"
// into "2k-$" and "<-2R" into "2R->". Wrapping each label in LTR isolates
// (U+2066 … U+2069) forces it to render left-to-right without affecting Hebrew
// category labels (setup names, day names), which we leave untouched.
const LRI = '⁦' // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩' // POP DIRECTIONAL ISOLATE
const ltr = (s: string | number) => `${LRI}${s}${PDI}`

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ChartCardProps {
  chartId: ChartId
  title: string
  ariaLabel?: string
  /** Inline controls rendered on the opposite side of the title (e.g. series toggles). */
  headerExtra?: React.ReactNode
  /** Initial / SSR height before the user-saved override loads. */
  defaultHeight?: number
  children: React.ReactNode
}
function ChartCard({ chartId, title, ariaLabel, headerExtra, defaultHeight = 220, children }: ChartCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  // On mount: apply any persisted user-resized height (imperatively, so React's
  // style prop stays stable at defaultHeight and doesn't fight subsequent
  // user-driven resizes). Then observe size changes from the native vertical
  // resize handle and persist them to localStorage.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const saved = loadChartHeights()[chartId]
    if (saved && saved >= 150) el.style.height = saved + 'px'
    let raf = 0
    const obs = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const h = Math.round(entry.contentRect.height)
        if (h >= 150) saveChartHeight(chartId, h)
      })
    })
    obs.observe(el)
    return () => { obs.disconnect(); cancelAnimationFrame(raf) }
  }, [chartId])
  return (
    <div className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[#888888] text-xs font-sans">{title}</h2>
        {headerExtra}
      </div>
      {/* SVG charts are not readable by assistive tech; expose a text alternative.
          The native vertical resize handle on the bottom-right lets users size
          each chart freely; the saved height comes back on every visit. */}
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel ?? title}
        style={{ height: defaultHeight }}
        className="resize-y overflow-hidden min-h-[150px]"
      >
        {children}
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <dl className="panel p-4">
      <dt className="text-[#888888] text-xs font-sans mb-1">{label}</dt>
      <dd className={`text-xl font-mono font-bold truncate m-0 ${color ?? 'text-[#E0E0E0]'}`}>{ltr(value)}</dd>
    </dl>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [holdUnit, setHoldUnit] = useState<HoldUnit>('hours')
  const [setupSeries, setSetupSeries] = useState<SetupSeries>(defaultSetupSeries)

  // Load persisted UI prefs from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setChartVisible(loadChartVisibility())
    setHoldUnit(loadHoldUnit())
    setSetupSeries(loadSetupSeries())
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(chartVisible)) } catch {}
  }, [chartVisible])

  useEffect(() => {
    try { localStorage.setItem(LS_KEY_HOLD_UNIT, holdUnit) } catch {}
  }, [holdUnit])

  useEffect(() => {
    try { localStorage.setItem(LS_KEY_SETUP_SERIES, JSON.stringify(setupSeries)) } catch {}
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
    return closedTrades.filter(t => {
      if (dateFrom && t.openedAt < new Date(dateFrom)) return false
      if (dateTo && t.openedAt > new Date(dateTo + 'T23:59:59')) return false
      if (tickerFilter && !t.ticker.toUpperCase().includes(tickerFilter.toUpperCase())) return false
      if (setupFilter !== 'all' && t.setupType !== setupFilter) return false
      if (directionFilter !== 'all' && t.direction !== directionFilter) return false
      if (resultFilter !== 'all' && t.result !== resultFilter) return false
      if (execQualMin !== '' && (t.executionQuality ?? 0) < Number(execQualMin)) return false
      if (execQualMax !== '' && (t.executionQuality ?? 10) > Number(execQualMax)) return false
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
      execQualMin, execQualMax, holdHoursMin, holdHoursMax, holdUnit])

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

  const chartData = useMemo(() => {
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

  function resetFilters() {
    setDateFrom(''); setDateTo(''); setTickerFilter(''); setSetupFilter('all')
    setDirectionFilter('all'); setResultFilter('all')
    setExecQualMin(''); setExecQualMax(''); setHoldHoursMin(''); setHoldHoursMax('')
  }

  const hasActiveFilter =
    !!(dateFrom || dateTo || tickerFilter || setupFilter !== 'all' || directionFilter !== 'all' ||
       resultFilter !== 'all' || execQualMin || execQualMax || holdHoursMin || holdHoursMax)

  // Metric card color helpers
  const winRateColor =
    stats.totalTrades === 0 ? 'text-[#E0E0E0]' :
    stats.winRate >= 0.5    ? 'text-[#2CC84A]' :
    stats.winRate >= 0.4    ? 'text-[#FFB800]' : 'text-[#FF4D4D]'

  const pfColor =
    stats.totalTrades === 0 ? 'text-[#E0E0E0]' :
    stats.profitFactor >= 1.5 ? 'text-[#2CC84A]' :
    stats.profitFactor < 1    ? 'text-[#FF4D4D]' : 'text-[#FFB800]'

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full relative">
      {/* Inner region (not <main> — the dashboard layout already provides the single main landmark) */}
      <div className="flex-1 overflow-auto p-6" dir="rtl">

        {/* ── Filter bar ──────────────────────────────────────────────────────── */}
        <div className="panel p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-end">

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-date-from" className="text-[#888888] text-xs font-sans">מתאריך</label>
              <div className="relative">
                <input id="filter-date-from" type="date" lang="en-GB"
                  data-empty={!dateFrom}
                  value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="input-base date-uppercase text-sm font-mono w-36" dir="ltr" />
                {!dateFrom && (
                  <span aria-hidden="true"
                    className="absolute top-1/2 left-2 -translate-y-1/2 pointer-events-none text-sm font-mono text-[#888888] tracking-tight">
                    DD / MM / YYYY
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-date-to" className="text-[#888888] text-xs font-sans">עד תאריך</label>
              <div className="relative">
                <input id="filter-date-to" type="date" lang="en-GB"
                  data-empty={!dateTo}
                  value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="input-base date-uppercase text-sm font-mono w-36" dir="ltr" />
                {!dateTo && (
                  <span aria-hidden="true"
                    className="absolute top-1/2 left-2 -translate-y-1/2 pointer-events-none text-sm font-mono text-[#888888] tracking-tight">
                    DD / MM / YYYY
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-ticker" className="text-[#888888] text-xs font-sans">טיקר</label>
              <input id="filter-ticker" type="text" placeholder="AAPL..." value={tickerFilter}
                onChange={e => setTickerFilter(e.target.value)}
                className="input-base text-sm font-mono w-24" dir="ltr" />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-setup" className="text-[#888888] text-xs font-sans">סטאפ</label>
              <select id="filter-setup" value={setupFilter} onChange={e => setSetupFilter(e.target.value)}
                className="input-base text-sm font-sans">
                <option value="all">הכל</option>
                {setupTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-direction" className="text-[#888888] text-xs font-sans">כיוון</label>
              <select id="filter-direction" value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}
                className="input-base text-sm font-sans">
                <option value="all">הכל</option>
                <option value="Long">Long</option>
                <option value="Short">Short</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-result" className="text-[#888888] text-xs font-sans">תוצאה</label>
              <select id="filter-result" value={resultFilter} onChange={e => setResultFilter(e.target.value)}
                className="input-base text-sm font-sans">
                <option value="all">הכל</option>
                <option value="Win">Win</option>
                <option value="Loss">Loss</option>
                <option value="Breakeven">Breakeven</option>
              </select>
            </div>

            <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-execqual-label">
              <span id="filter-execqual-label" className="text-[#888888] text-xs font-sans">איכות ביצוע (1-10)</span>
              <div className="flex gap-1 items-center">
                <input type="number" aria-label="איכות ביצוע מינימלית" placeholder="מינ׳" min={1} max={10} value={execQualMin}
                  onChange={e => setExecQualMin(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
                <span className="text-[#888888] text-xs" aria-hidden="true">–</span>
                <input type="number" aria-label="איכות ביצוע מקסימלית" placeholder="מקס׳" min={1} max={10} value={execQualMax}
                  onChange={e => setExecQualMax(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
              </div>
            </div>

            <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-hold-label">
              <span id="filter-hold-label" className="text-[#888888] text-xs font-sans">
                זמן החזקה ({holdUnit === 'days' ? 'ימים' : 'שעות'})
              </span>
              <div className="flex gap-1 items-center">
                <input type="number" aria-label={`זמן החזקה מינימלי ב${holdUnit === 'days' ? 'ימים' : 'שעות'}`}
                  placeholder="מינ׳" min={0} value={holdHoursMin}
                  onChange={e => setHoldHoursMin(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
                <span className="text-[#888888] text-xs" aria-hidden="true">–</span>
                <input type="number" aria-label={`זמן החזקה מקסימלי ב${holdUnit === 'days' ? 'ימים' : 'שעות'}`}
                  placeholder="מקס׳" min={0} value={holdHoursMax}
                  onChange={e => setHoldHoursMax(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
                <select value={holdUnit} onChange={e => setHoldUnit(e.target.value as HoldUnit)}
                  aria-label="יחידת מדידה לזמן ההחזקה"
                  className="input-base text-xs font-sans px-1">
                  <option value="hours">שעות</option>
                  <option value="days">ימים</option>
                </select>
              </div>
            </div>

            <div className="flex-1" />
            <div className="flex items-end gap-2">
              {hasActiveFilter && (
                <button onClick={resetFilters}
                  className="btn-ghost px-3 py-1.5 text-sm font-sans border border-[#333333] rounded text-[#888888]">
                  נקה פילטרים
                </button>
              )}
            </div>

          </div>
        </div>

        {/* Results region — announces metric/chart updates to screen readers when filters change */}
        <div aria-live="polite" aria-atomic="false">

        {/* ── Metrics row ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricCard label="טריידים" value={String(stats.totalTrades)} />
          <MetricCard
            label="אחוז הצלחה"
            value={stats.totalTrades === 0 ? '—' : `${(stats.winRate * 100).toFixed(1)}%`}
            color={winRateColor}
          />
          <MetricCard
            label="R ממוצע"
            value={stats.rTradeCount === 0 ? '—' : `${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`}
            color={stats.rTradeCount === 0 ? undefined : stats.avgR > 0 ? 'text-[#2CC84A]' : stats.avgR < 0 ? 'text-[#FF4D4D]' : 'text-[#E0E0E0]'}
          />
          <MetricCard
            label="Profit Factor"
            value={stats.totalTrades === 0 ? '—' : stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)}
            color={pfColor}
          />
          <MetricCard
            label="Expectancy"
            value={stats.rTradeCount === 0 ? '—' : `${stats.expectancy >= 0 ? '+' : ''}${stats.expectancy.toFixed(2)}R`}
            color={stats.rTradeCount === 0 ? undefined : stats.expectancy > 0 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}
          />
          <MetricCard
            label="Max Drawdown"
            value={stats.totalTrades === 0 ? '—' : formatUsd(stats.maxDrawdown)}
            color={stats.maxDrawdown < 0 ? 'text-[#FF4D4D]' : 'text-[#E0E0E0]'}
          />
          <MetricCard
            label="סה״כ P&L"
            value={stats.totalTrades === 0 ? '—' : formatUsd(stats.totalPnl)}
            color={stats.totalPnl > 0 ? 'text-[#2CC84A]' : stats.totalPnl < 0 ? 'text-[#FF4D4D]' : 'text-[#E0E0E0]'}
          />
          <dl className="panel p-4">
            <dt className="text-[#888888] text-xs font-sans mb-1">ממוצע רווח / הפסד</dt>
            {stats.totalTrades === 0 ? (
              <dd className="text-[#E0E0E0] text-xl font-mono font-bold m-0">—</dd>
            ) : (
              <dd className="text-xl font-mono font-bold m-0 truncate">
                <span className="text-[#2CC84A]">{ltr(formatUsd(stats.avgWin))}</span>
                <span className="text-[#888888] mx-1">/</span>
                <span className="text-[#FF4D4D]">{ltr(formatUsd(stats.avgLoss))}</span>
              </dd>
            )}
          </dl>
        </div>

        {/* ── Chart visibility toggle ──────────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[#888888] text-xs font-sans">גרפים מוצגים:</span>
          <button
            onClick={() => setTogglePanelOpen(p => !p)}
            aria-expanded={togglePanelOpen}
            aria-label={togglePanelOpen ? 'סגור עריכת גרפים מוצגים' : 'ערוך גרפים מוצגים'}
            className="text-[#FFB800] text-xs font-sans hover:opacity-80 transition-opacity rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFB800] focus-visible:outline-offset-2"
          >
            {togglePanelOpen ? <>סגור <span aria-hidden="true">✕</span></> : <>ערוך <span aria-hidden="true">✎</span></>}
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
            <p className="text-[#888888] font-sans text-base">
              {closedTrades.length === 0
                ? 'אין טריידים סגורים במערכת'
                : 'אין טריידים סגורים בטווח זה'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* 1 ── Equity Curve */}
            {chartVisible.equity && (
              <ChartCard chartId="equity" title="עקומת הון (R מצטבר)" ariaLabel="גרף עקומת הון: R מצטבר לאורך זמן">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.equity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="date"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={v => new Date(v).toLocaleDateString('he-IL', { month: 'short', day: 'numeric' })}
                      stroke={AXIS_STROKE}
                      tick={AXIS_TICK} tickMargin={6}
                      tickCount={5}
                    />
                    <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} tickMargin={6} tickFormatter={v => ltr(`${v}R`)} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={v => new Date(v as number).toLocaleDateString('he-IL')}
                      formatter={(v: number) => [ltr(`${v >= 0 ? '+' : ''}${v.toFixed(2)}R`), 'R מצטבר']}
                    />
                    <ReferenceLine y={0} stroke="#444444" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="cumulativeR" stroke="#FFB800" dot={false} strokeWidth={2} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* 2 ── R Distribution */}
            {chartVisible.rdist && (
              <ChartCard chartId="rdist" title="התפלגות R" ariaLabel="גרף עמודות: התפלגות הטריידים לפי מכפיל R">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.rdist}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" stroke={AXIS_STROKE} tick={AXIS_TICK} tickMargin={6} tickFormatter={ltr} />
                    <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} tickMargin={6} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, 'טריידים']} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      {chartData.rdist.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={['<-2R', '-2R–-1R', '-1R–0R'].includes(entry.label) ? '#FF4D4D' : '#2CC84A'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* 3 ── Setup Performance */}
            {chartVisible.setup && (
              <ChartCard
                chartId="setup"
                title="ביצועי סטאפ"
                ariaLabel="גרף עמודות: ביצועי כל סוג סטאפ — R ממוצע ואחוז הצלחה"
                headerExtra={
                  <div className="flex items-center gap-3 text-xs font-sans">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={setupSeries.avgR}
                        onChange={e => setSetupSeries(p => ({ ...p, avgR: e.target.checked }))}
                        className="accent-[#FFB800]" />
                      <span style={{ color: '#FFB800' }}>Avg R</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={setupSeries.winRate}
                        onChange={e => setSetupSeries(p => ({ ...p, winRate: e.target.checked }))}
                        className="accent-[#2CC84A]" />
                      <span style={{ color: '#2CC84A' }}>Win Rate</span>
                    </label>
                  </div>
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.setup}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="setupType" stroke={AXIS_STROKE} tick={AXIS_TICK} tickMargin={6} />
                    {setupSeries.avgR && (
                      <YAxis yAxisId="r" stroke={AXIS_STROKE} tick={AXIS_TICK} tickMargin={6} tickFormatter={v => ltr(`${v}R`)} />
                    )}
                    {setupSeries.winRate && (
                      <YAxis
                        yAxisId="wr"
                        orientation="right"
                        stroke={AXIS_STROKE}
                        tick={AXIS_TICK} tickMargin={6}
                        tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                        domain={[0, 1]}
                      />
                    )}
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, name: string) =>
                        name === 'winRate'
                          ? [`${(v * 100).toFixed(1)}%`, 'Win Rate']
                          : [ltr(`${v >= 0 ? '+' : ''}${v.toFixed(2)}R`), 'Avg R']
                      }
                    />
                    {setupSeries.avgR && setupSeries.winRate && (
                      <Legend
                        formatter={(v: string) => (
                          <span style={{ color: '#888888', fontSize: 11 }}>
                            {v === 'winRate' ? 'Win Rate' : 'Avg R'}
                          </span>
                        )}
                      />
                    )}
                    {setupSeries.avgR && (
                      <Bar yAxisId="r"  dataKey="avgR"     fill="#FFB800" name="avgR"    radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    )}
                    {setupSeries.winRate && (
                      <Bar yAxisId="wr" dataKey="winRate"  fill="#2CC84A" name="winRate" radius={[3, 3, 0, 0]} opacity={0.75} isAnimationActive={false} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* 4 ── P&L by Ticker */}
            {chartVisible.ticker && (
              <ChartCard chartId="ticker" title="P&L לפי נייר" ariaLabel="גרף עמודות אופקי: רווח והפסד מצטבר לכל נייר">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.ticker} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis
                      type="number"
                      stroke={AXIS_STROKE}
                      tick={AXIS_TICK} tickMargin={6}
                      tickFormatter={v =>
                        ltr(Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)
                      }
                    />
                    <YAxis type="category" dataKey="ticker" stroke={AXIS_STROKE} tick={AXIS_TICK} tickMargin={6} width={55} interval={0} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatUsd(v), 'P&L']} />
                    <ReferenceLine x={0} stroke="#444444" strokeDasharray="4 4" />
                    <Bar dataKey="totalPnl" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                      {chartData.ticker.map((entry, i) => (
                        <Cell key={i} fill={entry.totalPnl >= 0 ? '#2CC84A' : '#FF4D4D'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* 5 ── Hold Time vs R (scatter) */}
            {chartVisible.holdtime && (
              <ChartCard chartId="holdtime" title="זמן החזקה vs R" ariaLabel="גרף פיזור: זמן החזקת הטרייד מול מכפיל R, מסומן לפי תוצאה">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="holdHours"
                      type="number"
                      name="שעות"
                      stroke={AXIS_STROKE}
                      tick={AXIS_TICK} tickMargin={6}
                      tickFormatter={v => ltr(v < 24 ? `${v}h` : `${(v / 24).toFixed(0)}d`)}
                      label={{ value: 'זמן', position: 'insideBottom', offset: -10, fill: '#888888', fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="actualR"
                      type="number"
                      name="R"
                      stroke={AXIS_STROKE}
                      tick={AXIS_TICK} tickMargin={6}
                      tickFormatter={v => ltr(`${v}R`)}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ payload }) => {
                        if (!payload?.length) return null
                        const p = payload[0]?.payload as { holdHours: number; actualR: number; ticker: string }
                        if (!p) return null
                        return (
                          <div style={TOOLTIP_STYLE} dir="ltr" className="px-3 py-2 rounded">
                            <p className="font-mono font-bold text-[#E0E0E0] text-sm">{p.ticker}</p>
                            <p className="text-[#888888] text-xs">
                              {p.holdHours < 24 ? `${p.holdHours.toFixed(1)}h` : `${(p.holdHours / 24).toFixed(1)}d`}
                            </p>
                            <p className={`text-sm ${p.actualR >= 0 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}`}>
                              {p.actualR >= 0 ? '+' : ''}{p.actualR.toFixed(2)}R
                            </p>
                          </div>
                        )
                      }}
                    />
                    <ReferenceLine y={0} stroke="#444444" strokeDasharray="4 4" />
                    <Legend
                      formatter={(v: string) => (
                        <span style={{ color: '#888888', fontSize: 11 }}>{v}</span>
                      )}
                    />
                    <Scatter name="Win"  data={chartData.holdWins}  fill="#2CC84A" opacity={0.8} isAnimationActive={false} />
                    <Scatter name="Loss" data={chartData.holdLoss}  fill="#FF4D4D" opacity={0.8} isAnimationActive={false} />
                    {chartData.holdOther.length > 0 && (
                      <Scatter name="אחר" data={chartData.holdOther} fill="#888888" opacity={0.8} isAnimationActive={false} />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* 6 ── P&L by Day of Week + Hour */}
            {chartVisible.dayhour && (
              <ChartCard chartId="dayhour" defaultHeight={360} title="P&L לפי יום/שעה" ariaLabel="גרפי עמודות: רווח והפסד לפי יום בשבוע ולפי שעת סגירה">
                {/* Sub-chart heights are fixed (not flex-1) — nesting Recharts'
                    ResponsiveContainer inside a flex-1 + min-h-0 + h-full chain caused a layout
                    loop in dev. Bumping the card defaultHeight to 360 (vs the prior 220) gives
                    each sub-chart at 150px the breathing room the user asked for, and the user
                    can resize the card larger via the bottom-right handle for even more space. */}
                <div className="flex flex-col gap-4">

                  <div>
                    <h3 className="text-[#888888] text-xs font-sans mb-1">לפי יום שבוע</h3>
                    <div style={{ height: 150 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.dayofweek} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                          <XAxis dataKey="day" stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} tickMargin={4} />
                          <YAxis stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} tickMargin={4} tickFormatter={v => ltr(`$${v}`)} width={40} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatUsd(v), 'P&L']} />
                          <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                            {chartData.dayofweek.map((entry, i) => (
                              <Cell key={i} fill={entry.totalPnl >= 0 ? '#2CC84A' : '#FF4D4D'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {chartData.hour.length > 0 && (
                    <div>
                      <h3 className="text-[#888888] text-xs font-sans mb-1">לפי שעה</h3>
                      <div style={{ height: 150 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData.hour} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                            <XAxis
                              dataKey="hour"
                              stroke={AXIS_STROKE}
                              tick={{ ...AXIS_TICK, fontSize: 10 }} tickMargin={4}
                              tickFormatter={v => `${String(v).padStart(2, '0')}:00`}
                            />
                            <YAxis stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} tickMargin={4} tickFormatter={v => ltr(`$${v}`)} width={40} />
                            <Tooltip
                              contentStyle={TOOLTIP_STYLE}
                              labelFormatter={v => `${String(v).padStart(2, '0')}:00`}
                              formatter={(v: number) => [formatUsd(v), 'P&L']}
                            />
                            <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                              {chartData.hour.map((entry, i) => (
                                <Cell key={i} fill={entry.totalPnl >= 0 ? '#2CC84A' : '#FF4D4D'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              </ChartCard>
            )}

          </div>
        )}
        </div>
        {/* /aria-live results region */}
      </div>

    </div>
  )
}
