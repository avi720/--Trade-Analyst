'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line,
  BarChart, Bar,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine,
} from 'recharts'
import { ChatSidebar } from './chat-sidebar'
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
  if (t.actualR == null || t.realizedPnl == null || !t.closedAt) return null
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4 flex flex-col gap-3">
      <p className="text-[#888888] text-xs font-sans">{title}</p>
      {children}
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-[#888888] text-xs font-sans mb-1">{label}</p>
      <p className={`text-xl font-mono font-bold truncate ${color ?? 'text-[#E0E0E0]'}`}>{value}</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ResearchDashboard({ trades: rawTrades }: Props) {
  const [chatOpen, setChatOpen] = useState(false)
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

  // Load chart visibility from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setChartVisible(loadChartVisibility())
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(chartVisible)) } catch {}
  }, [chartVisible])

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
        if (holdHoursMin !== '' && hrs < Number(holdHoursMin)) return false
        if (holdHoursMax !== '' && hrs > Number(holdHoursMax)) return false
      }
      return true
    })
  }, [closedTrades, dateFrom, dateTo, tickerFilter, setupFilter, directionFilter, resultFilter,
      execQualMin, execQualMax, holdHoursMin, holdHoursMax])

  const stats = useMemo(() => calcStats(filteredTrades), [filteredTrades])

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
      <main className="flex-1 overflow-auto p-6" dir="rtl">

        {/* ── Filter bar ──────────────────────────────────────────────────────── */}
        <div className="panel p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-end">

            <div className="flex flex-col gap-1">
              <label className="text-[#888888] text-xs font-sans">מתאריך</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="input-base text-sm font-mono w-36" dir="ltr" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[#888888] text-xs font-sans">עד תאריך</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="input-base text-sm font-mono w-36" dir="ltr" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[#888888] text-xs font-sans">טיקר</label>
              <input type="text" placeholder="AAPL..." value={tickerFilter}
                onChange={e => setTickerFilter(e.target.value)}
                className="input-base text-sm font-mono w-24" dir="ltr" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[#888888] text-xs font-sans">סטאפ</label>
              <select value={setupFilter} onChange={e => setSetupFilter(e.target.value)}
                className="input-base text-sm font-sans">
                <option value="all">הכל</option>
                {setupTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[#888888] text-xs font-sans">כיוון</label>
              <select value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}
                className="input-base text-sm font-sans">
                <option value="all">הכל</option>
                <option value="Long">Long</option>
                <option value="Short">Short</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[#888888] text-xs font-sans">תוצאה</label>
              <select value={resultFilter} onChange={e => setResultFilter(e.target.value)}
                className="input-base text-sm font-sans">
                <option value="all">הכל</option>
                <option value="Win">Win</option>
                <option value="Loss">Loss</option>
                <option value="Breakeven">Breakeven</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[#888888] text-xs font-sans">איכות ביצוע (1-10)</label>
              <div className="flex gap-1 items-center">
                <input type="number" placeholder="מינ׳" min={1} max={10} value={execQualMin}
                  onChange={e => setExecQualMin(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
                <span className="text-[#888888] text-xs">–</span>
                <input type="number" placeholder="מקס׳" min={1} max={10} value={execQualMax}
                  onChange={e => setExecQualMax(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[#888888] text-xs font-sans">זמן החזקה (שעות)</label>
              <div className="flex gap-1 items-center">
                <input type="number" placeholder="מינ׳" min={0} value={holdHoursMin}
                  onChange={e => setHoldHoursMin(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
                <span className="text-[#888888] text-xs">–</span>
                <input type="number" placeholder="מקס׳" min={0} value={holdHoursMax}
                  onChange={e => setHoldHoursMax(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
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
              <button onClick={() => setChatOpen(true)}
                className="btn-ghost px-3 py-1.5 text-sm font-sans text-[#FFB800] border border-[#333333] rounded">
                חנן ▶
              </button>
            </div>

          </div>
        </div>

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
            value={stats.totalTrades === 0 ? '—' : `${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`}
            color={stats.totalTrades === 0 ? undefined : stats.avgR > 0 ? 'text-[#2CC84A]' : stats.avgR < 0 ? 'text-[#FF4D4D]' : 'text-[#E0E0E0]'}
          />
          <MetricCard
            label="Profit Factor"
            value={stats.totalTrades === 0 ? '—' : stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)}
            color={pfColor}
          />
          <MetricCard
            label="Expectancy"
            value={stats.totalTrades === 0 ? '—' : `${stats.expectancy >= 0 ? '+' : ''}${stats.expectancy.toFixed(2)}R`}
            color={stats.totalTrades === 0 ? undefined : stats.expectancy > 0 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}
          />
          <MetricCard
            label="Max Drawdown"
            value={stats.totalTrades === 0 ? '—' : `${stats.maxDrawdown.toFixed(2)}R`}
            color={stats.maxDrawdown < 0 ? 'text-[#FF4D4D]' : 'text-[#E0E0E0]'}
          />
          <MetricCard
            label="סה״כ P&L"
            value={stats.totalTrades === 0 ? '—' : formatUsd(stats.totalPnl)}
            color={stats.totalPnl > 0 ? 'text-[#2CC84A]' : stats.totalPnl < 0 ? 'text-[#FF4D4D]' : 'text-[#E0E0E0]'}
          />
          <div className="panel p-4">
            <p className="text-[#888888] text-xs font-sans mb-1">ממוצע ריווח / הפסד</p>
            {stats.totalTrades === 0 ? (
              <p className="text-[#E0E0E0] text-xl font-mono font-bold">—</p>
            ) : (
              <p className="text-sm font-mono font-bold mt-1">
                <span className="text-[#2CC84A]">+{stats.avgWin.toFixed(2)}R</span>
                <span className="text-[#888888] mx-1">/</span>
                <span className="text-[#FF4D4D]">{stats.avgLoss.toFixed(2)}R</span>
              </p>
            )}
          </div>
        </div>

        {/* ── Chart visibility toggle ──────────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[#888888] text-xs font-sans">גרפים מוצגים:</span>
          <button
            onClick={() => setTogglePanelOpen(p => !p)}
            className="text-[#FFB800] text-xs font-sans hover:opacity-80 transition-opacity"
          >
            {togglePanelOpen ? 'סגור ✕' : 'ערוך ✎'}
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
          <div className="panel p-16 text-center">
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
              <ChartCard title="עקומת הון (R מצטבר)">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData.equity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="date"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={v => new Date(v).toLocaleDateString('he-IL', { month: 'short', day: 'numeric' })}
                      stroke={AXIS_STROKE}
                      tick={AXIS_TICK}
                      tickCount={5}
                    />
                    <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} tickFormatter={v => `${v}R`} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={v => new Date(v as number).toLocaleDateString('he-IL')}
                      formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}R`, 'R מצטבר']}
                    />
                    <ReferenceLine y={0} stroke="#444444" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="cumulativeR" stroke="#FFB800" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* 2 ── R Distribution */}
            {chartVisible.rdist && (
              <ChartCard title="התפלגות R">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData.rdist}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" stroke={AXIS_STROKE} tick={AXIS_TICK} />
                    <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, 'טריידים']} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
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
              <ChartCard title="ביצועי סטאפ">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData.setup}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="setupType" stroke={AXIS_STROKE} tick={AXIS_TICK} />
                    <YAxis yAxisId="r" stroke={AXIS_STROKE} tick={AXIS_TICK} tickFormatter={v => `${v}R`} />
                    <YAxis
                      yAxisId="wr"
                      orientation="right"
                      stroke={AXIS_STROKE}
                      tick={AXIS_TICK}
                      tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                      domain={[0, 1]}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, name: string) =>
                        name === 'winRate'
                          ? [`${(v * 100).toFixed(1)}%`, 'Win Rate']
                          : [`${v >= 0 ? '+' : ''}${v.toFixed(2)}R`, 'Avg R']
                      }
                    />
                    <Legend
                      formatter={(v: string) => (
                        <span style={{ color: '#888888', fontSize: 11 }}>
                          {v === 'winRate' ? 'Win Rate' : 'Avg R'}
                        </span>
                      )}
                    />
                    <Bar yAxisId="r"  dataKey="avgR"     fill="#FFB800" name="avgR"    radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="wr" dataKey="winRate"  fill="#2CC84A" name="winRate" radius={[3, 3, 0, 0]} opacity={0.75} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* 4 ── P&L by Ticker */}
            {chartVisible.ticker && (
              <ChartCard title="P&L לפי נייר">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData.ticker} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis
                      type="number"
                      stroke={AXIS_STROKE}
                      tick={AXIS_TICK}
                      tickFormatter={v =>
                        Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                      }
                    />
                    <YAxis type="category" dataKey="ticker" stroke={AXIS_STROKE} tick={AXIS_TICK} width={55} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatUsd(v), 'P&L']} />
                    <ReferenceLine x={0} stroke="#444444" strokeDasharray="4 4" />
                    <Bar dataKey="totalPnl" radius={[0, 3, 3, 0]}>
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
              <ChartCard title="זמן החזקה vs R">
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="holdHours"
                      type="number"
                      name="שעות"
                      stroke={AXIS_STROKE}
                      tick={AXIS_TICK}
                      tickFormatter={v => v < 24 ? `${v}h` : `${(v / 24).toFixed(0)}d`}
                      label={{ value: 'זמן', position: 'insideBottom', offset: -10, fill: '#888888', fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="actualR"
                      type="number"
                      name="R"
                      stroke={AXIS_STROKE}
                      tick={AXIS_TICK}
                      tickFormatter={v => `${v}R`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ payload }) => {
                        if (!payload?.length) return null
                        const p = payload[0]?.payload as { holdHours: number; actualR: number; ticker: string }
                        if (!p) return null
                        return (
                          <div style={TOOLTIP_STYLE} className="px-3 py-2 rounded">
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
                    <Scatter name="Win"  data={chartData.holdWins}  fill="#2CC84A" opacity={0.8} />
                    <Scatter name="Loss" data={chartData.holdLoss}  fill="#FF4D4D" opacity={0.8} />
                    {chartData.holdOther.length > 0 && (
                      <Scatter name="אחר" data={chartData.holdOther} fill="#888888" opacity={0.8} />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* 6 ── P&L by Day of Week + Hour */}
            {chartVisible.dayhour && (
              <ChartCard title="P&L לפי יום/שעה">
                <div className="flex flex-col gap-4">

                  <div>
                    <p className="text-[#888888] text-xs font-sans mb-1">לפי יום שבוע</p>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={chartData.dayofweek} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="day" stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} />
                        <YAxis stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} tickFormatter={v => `$${v}`} width={40} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatUsd(v), 'P&L']} />
                        <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]}>
                          {chartData.dayofweek.map((entry, i) => (
                            <Cell key={i} fill={entry.totalPnl >= 0 ? '#2CC84A' : '#FF4D4D'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {chartData.hour.length > 0 && (
                    <div>
                      <p className="text-[#888888] text-xs font-sans mb-1">לפי שעה</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={chartData.hour} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                          <XAxis
                            dataKey="hour"
                            stroke={AXIS_STROKE}
                            tick={{ ...AXIS_TICK, fontSize: 10 }}
                            tickFormatter={v => `${String(v).padStart(2, '0')}:00`}
                          />
                          <YAxis stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} tickFormatter={v => `$${v}`} width={40} />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            labelFormatter={v => `${String(v).padStart(2, '0')}:00`}
                            formatter={(v: number) => [formatUsd(v), 'P&L']}
                          />
                          <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]}>
                            {chartData.hour.map((entry, i) => (
                              <Cell key={i} fill={entry.totalPnl >= 0 ? '#2CC84A' : '#FF4D4D'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </ChartCard>
            )}

          </div>
        )}
      </main>

      {/* AI Chat sidebar stub */}
      <ChatSidebar isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
