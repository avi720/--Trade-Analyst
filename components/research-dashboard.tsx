'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
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
import { InfoTooltip } from '@/components/info-tooltip'
import { METRIC_INFO, CHART_INFO } from '@/components/research-info'

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

interface ChartSize { w?: number; h?: number }
/** Read all persisted chart sizes. Migrates legacy number entries (height-only) to {h}. */
function loadChartSizes(): Record<string, ChartSize> {
  try {
    const v = localStorage.getItem(LS_KEY_CHART_HEIGHTS)
    if (!v) return {}
    const parsed = JSON.parse(v) as Record<string, number | ChartSize>
    const out: Record<string, ChartSize> = {}
    for (const [k, val] of Object.entries(parsed)) {
      if (typeof val === 'number') out[k] = { h: val }
      else if (val && typeof val === 'object') out[k] = val
    }
    return out
  } catch {}
  return {}
}
function saveChartSize(chartId: string, size: ChartSize) {
  try {
    const cur = loadChartSizes()
    cur[chartId] = { ...cur[chartId], ...size }
    localStorage.setItem(LS_KEY_CHART_HEIGHTS, JSON.stringify(cur))
  } catch {}
}

const LS_KEY_ROW_RATIOS = 'research_row_ratios'
function loadRowRatios(): Record<string, number> {
  try {
    const v = localStorage.getItem(LS_KEY_ROW_RATIOS)
    if (v) return JSON.parse(v) as Record<string, number>
  } catch {}
  return {}
}
function saveRowRatio(pairKey: string, ratio: number) {
  try {
    const cur = loadRowRatios()
    cur[pairKey] = ratio
    localStorage.setItem(LS_KEY_ROW_RATIOS, JSON.stringify(cur))
  } catch {}
}

const FULLWIDTH_CHARTS = new Set<ChartId>(['setup'])

type ChartRow =
  | { type: 'full'; chartId: ChartId }
  | { type: 'pair'; chartIds: [ChartId, ChartId]; pairKey: string }
  | { type: 'solo'; chartId: ChartId }

function groupChartsIntoRows(vis: Record<ChartId, boolean>): ChartRow[] {
  const rows: ChartRow[] = []
  const buf: ChartId[] = []
  for (const id of CHART_IDS) {
    if (!vis[id]) continue
    if (FULLWIDTH_CHARTS.has(id)) {
      if (buf.length === 1) { rows.push({ type: 'solo', chartId: buf.pop()! }) }
      rows.push({ type: 'full', chartId: id })
    } else {
      buf.push(id)
      if (buf.length === 2) {
        const a = buf[0], b = buf[1]
        const pairKey = a < b ? `${a}_${b}` : `${b}_${a}`
        rows.push({ type: 'pair', chartIds: [a, b], pairKey })
        buf.length = 0
      }
    }
  }
  if (buf.length === 1) rows.push({ type: 'solo', chartId: buf[0] })
  return rows
}

// ─── Shared chart styling ─────────────────────────────────────────────────────

const TOOLTIP_STYLE: React.CSSProperties = {
  background: '#111111',
  border: '1px solid #333333',
  color: '#E0E0E0',
  fontSize: 12,
  borderRadius: 4,
}
const AXIS_TICK = { fill: '#B0B0B0', fontSize: 12 }
const GRID_STROKE = '#1E1E1E'
const AXIS_STROKE = '#333333'

// Distinct color palette for per-setup bars in the setup-performance chart.
// Tuned for the dark theme (good contrast on #111 panel bg).
const SETUP_COLORS = [
  '#FFB800', // amber
  '#4DA6FF', // blue
  '#B36BFF', // purple
  '#2AD8D8', // cyan
  '#FF8A4D', // orange
  '#BFFF4D', // yellow-green
  '#FF4D8A', // pink
  '#4DFFB8', // mint
]

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
  /** Explainer content shown via the ⓘ button next to the title. */
  info?: React.ReactNode
  /** Inline controls rendered on the opposite side of the title (e.g. series toggles). */
  headerExtra?: React.ReactNode
  /** Content rendered below the chart area (e.g. a colored legend for the setup chart). */
  footerExtra?: React.ReactNode
  /** Initial / SSR height before the user-saved override loads. */
  defaultHeight?: number
  /** Span the full row by default (used for the setup chart). */
  fullWidth?: boolean
  /** Position within a pair row — determines width-drag direction. null = solo/full. */
  pairPosition?: 'first' | 'second' | null
  /** Called during width drag with pixel delta from drag start. */
  onWidthDrag?: (deltaX: number) => void
  /** Called when width drag ends. */
  onWidthDragEnd?: () => void
  children: React.ReactNode
}

// Minimum user-resizable dimensions for chart cards.
const MIN_CHART_W = 280
const MIN_CHART_H = 150

function ChartCard({ chartId, title, ariaLabel, info, headerExtra, footerExtra, defaultHeight = 220, fullWidth = false, pairPosition, onWidthDrag, onWidthDragEnd, children }: ChartCardProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const saved = loadChartSizes()[chartId]
    if (saved?.h && saved.h >= MIN_CHART_H) inner.style.height = saved.h + 'px'
  }, [chartId])

  function handleMouseDown(e: React.MouseEvent<HTMLSpanElement>) {
    e.preventDefault()
    const panel = panelRef.current
    const inner = innerRef.current
    if (!panel || !inner) return
    const p = panel
    const i = inner
    const startX = e.clientX

    function findScroller(start: HTMLElement): HTMLElement {
      let el: HTMLElement | null = start.parentElement
      while (el) {
        const oy = getComputedStyle(el).overflowY
        if (oy === 'auto' || oy === 'scroll') return el
        el = el.parentElement
      }
      return (document.scrollingElement as HTMLElement) ?? document.documentElement
    }
    const scroller = findScroller(p)

    let scrollDir = 0
    let scrollTimer: ReturnType<typeof setInterval> | null = null
    function tickScroll() {
      if (scrollDir === 0) return
      scroller.scrollTop += scrollDir * 4
      if (lastMoveEv) updateSize(lastMoveEv)
    }
    function startScroll(dir: -1 | 1) {
      if (scrollDir === dir) return
      scrollDir = dir
      if (!scrollTimer) scrollTimer = setInterval(tickScroll, 16)
    }
    function stopScroll() {
      scrollDir = 0
      if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null }
    }

    function updateSize(ev: MouseEvent) {
      const innerRect = i.getBoundingClientRect()
      const newH = Math.max(MIN_CHART_H, ev.clientY - innerRect.top)
      i.style.height = newH + 'px'
      if (onWidthDrag) {
        onWidthDrag(ev.clientX - startX)
      }
    }

    let lastMoveEv: MouseEvent | null = null
    function onMove(ev: MouseEvent) {
      lastMoveEv = ev
      updateSize(ev)
      const vh = window.innerHeight
      const margin = 50
      if (ev.clientY > vh - margin) startScroll(1)
      else if (ev.clientY < margin) startScroll(-1)
      else stopScroll()
    }
    function onUp() {
      stopScroll()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      saveChartSize(chartId, { h: i.offsetHeight })
      onWidthDragEnd?.()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={panelRef}
      data-chart-panel={chartId}
      className="panel p-4 flex flex-col gap-3 relative min-w-0"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[#B0B0B0] text-sm font-sans flex items-center gap-2">
          <span>{title}</span>
          {info && <InfoTooltip label={`מידע על ${title}`}>{info}</InfoTooltip>}
        </h2>
        {headerExtra}
      </div>
      {/* The chart content is forced to dir=ltr — Recharts SVGs inherit the
          page's dir=rtl, which flips text-anchor="end" semantics in some
          browsers and pushes Y-axis tick text *onto* the axis line. LTR here
          fixes the placement; Hebrew category labels inside the chart still
          render correctly because Hebrew runs are strong-RTL regardless. */}
      <div
        ref={innerRef}
        data-chart-inner={chartId}
        role="img"
        aria-label={ariaLabel ?? title}
        style={{ height: defaultHeight, direction: 'ltr' }}
        className="overflow-hidden min-h-[150px]"
      >
        {children}
      </div>
      {footerExtra}
      {/* Custom resize handle. For left-side charts (second in pair, RTL) the
          handle moves to the bottom-right (the inner edge, toward the center)
          so the user expands the chart toward the visible center of the page. */}
      <span
        onMouseDown={handleMouseDown}
        aria-label="שינוי גודל גרף"
        role="separator"
        className={`absolute bottom-1 ${pairPosition === 'second' ? 'right-1' : 'left-1'} w-3.5 h-3.5 cursor-nwse-resize text-[#666] hover:text-[#FFB800] select-none`}
        style={{ lineHeight: 1 }}
      >
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" style={pairPosition === 'second' ? { transform: 'scaleX(-1)' } : undefined}>
          <path d="M2 12 L12 2 M6 12 L12 6 M10 12 L12 10" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  )
}

function PairRow({
  pairKey,
  initialRatio,
  onRatioCommit,
  children,
}: {
  pairKey: string
  initialRatio: number
  onRatioCommit: (pairKey: string, ratio: number) => void
  children: [React.ReactElement, React.ReactElement]
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const ratioRef = useRef(initialRatio)
  const startRatioRef = useRef(initialRatio)

  useEffect(() => { ratioRef.current = initialRatio }, [initialRatio])

  const applyRatio = (r: number) => {
    const row = rowRef.current
    if (!row) return
    const gap = 16
    const totalW = row.offsetWidth - gap
    const first = row.children[0] as HTMLElement | undefined
    const second = row.children[1] as HTMLElement | undefined
    if (first) first.style.width = (r * totalW) + 'px'
    if (second) second.style.width = ((1 - r) * totalW) + 'px'
  }

  useEffect(() => { applyRatio(initialRatio) }, [initialRatio])

  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const obs = new ResizeObserver(() => applyRatio(ratioRef.current))
    obs.observe(row)
    return () => obs.disconnect()
  }, [])

  const draggingRef = useRef(false)

  const makeWidthDrag = (_pos: 'first' | 'second') => (deltaX: number) => {
    if (!draggingRef.current) {
      startRatioRef.current = ratioRef.current
      draggingRef.current = true
    }
    const row = rowRef.current
    if (!row) return
    const gap = 16
    const totalW = row.offsetWidth - gap
    if (totalW <= 0) return
    const ratioDelta = deltaX / totalW
    // Handle is always at physical left of each panel. In RTL the first
    // chart sits on the right so dragging its handle left (negative deltaX)
    // expands it → ratio increases. For the second chart (left side),
    // dragging its handle right (positive deltaX) expands it → ratio
    // decreases. Both cases resolve to: ratio = start − delta.
    let newRatio = startRatioRef.current - ratioDelta
    const minR = MIN_CHART_W / totalW
    newRatio = Math.max(minR, Math.min(1 - minR, newRatio))
    ratioRef.current = newRatio
    applyRatio(newRatio)
  }

  const makeWidthDragEnd = () => () => {
    draggingRef.current = false
    const r = ratioRef.current
    startRatioRef.current = r
    onRatioCommit(pairKey, r)
  }

  const [first, second] = children
  return (
    <div ref={rowRef} className="flex gap-4 flex-col lg:flex-row lg:items-start" dir="rtl">
      {React.cloneElement(first, {
        pairPosition: 'first' as const,
        onWidthDrag: makeWidthDrag('first'),
        onWidthDragEnd: makeWidthDragEnd(),
      } as Partial<ChartCardProps>)}
      {React.cloneElement(second, {
        pairPosition: 'second' as const,
        onWidthDrag: makeWidthDrag('second'),
        onWidthDragEnd: makeWidthDragEnd(),
      } as Partial<ChartCardProps>)}
    </div>
  )
}

/**
 * Day/hour double-chart inner content. Tracks its parent's height via
 * ResizeObserver and computes each Recharts ResponsiveContainer's numeric
 * height in pixels — using flex-1 with ResponsiveContainer height="100%"
 * causes Recharts to enter a layout loop on resize, so explicit pixel
 * heights are required.
 */
function DayHourInner({
  dayofweek,
  hour,
}: {
  dayofweek: { day: string; totalPnl: number; tradeCount: number }[]
  hour: { hour: number; totalPnl: number; tradeCount: number }[]
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [subH, setSubH] = useState(150)
  const hasHour = hour.length > 0
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const compute = () => {
      const subs = hasHour ? 2 : 1
      const h3PerSection = 20  // h3 + mb-1
      const gapBetween = 8      // gap-2
      const usable = el.offsetHeight - h3PerSection * subs - gapBetween * (subs - 1)
      const each = Math.max(80, Math.floor(usable / subs))
      setSubH(each)
    }
    compute()
    const obs = new ResizeObserver(compute)
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasHour])
  return (
    <div ref={wrapperRef} className="flex flex-col gap-2 h-full">
      <div>
        <h3 className="text-[#B0B0B0] text-sm font-sans mb-1">לפי יום שבוע</h3>
        <ResponsiveContainer width="100%" height={subH}>
          <BarChart data={dayofweek} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="day" stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} tickMargin={4} />
            <YAxis stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} tickMargin={4} tickFormatter={v => ltr(`$${v}`)} width={40} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatUsd(v), 'P&L']} />
            <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {dayofweek.map((entry, i) => (
                <Cell key={i} fill={entry.totalPnl >= 0 ? '#2CC84A' : '#FF4D4D'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hasHour && (
        <div>
          <h3 className="text-[#B0B0B0] text-sm font-sans mb-1">לפי שעה</h3>
          <ResponsiveContainer width="100%" height={subH}>
            <BarChart data={hour} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
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
                {hour.map((entry, i) => (
                  <Cell key={i} fill={entry.totalPnl >= 0 ? '#2CC84A' : '#FF4D4D'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, color, info }: { label: string; value: string; color?: string; info?: React.ReactNode }) {
  return (
    <dl className="panel p-4">
      <dt className="text-[#B0B0B0] text-sm font-sans mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        {info && <InfoTooltip label={`מידע על ${label}`}>{info}</InfoTooltip>}
      </dt>
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
  const [rMin, setRMin] = useState('')
  const [rMax, setRMax] = useState('')
  const [holdUnit, setHoldUnit] = useState<HoldUnit>('hours')
  const [setupSeries, setSetupSeries] = useState<SetupSeries>(defaultSetupSeries)
  const [rowRatios, setRowRatios] = useState<Record<string, number>>({})
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    setChartVisible(loadChartVisibility())
    setHoldUnit(loadHoldUnit())
    setSetupSeries(loadSetupSeries())
    setRowRatios(loadRowRatios())
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

  const chartRows = useMemo(() => groupChartsIntoRows(chartVisible), [chartVisible])

  function handleRatioCommit(pairKey: string, ratio: number) {
    setRowRatios(prev => ({ ...prev, [pairKey]: ratio }))
    saveRowRatio(pairKey, ratio)
  }

  function resetChartSizes() {
    try { localStorage.removeItem(LS_KEY_CHART_HEIGHTS) } catch {}
    try { localStorage.removeItem(LS_KEY_ROW_RATIOS) } catch {}
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

  function renderChart(id: ChartId, defaultHeightOverride?: number): React.ReactElement {
    const dh = defaultHeightOverride ?? chartDefaultHeight(id)
    switch (id) {
      case 'equity':
        return (
          <ChartCard chartId="equity" title="עקומת הון (R מצטבר)" ariaLabel="גרף עקומת הון: R מצטבר לאורך זמן" defaultHeight={dh} info={CHART_INFO.equity}>
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
        )
      case 'rdist':
        return (
          <ChartCard chartId="rdist" title="התפלגות R" ariaLabel="גרף עמודות: התפלגות הטריידים לפי מכפיל R" defaultHeight={dh} info={CHART_INFO.rdist}>
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
        )
      case 'setup':
        return (
          <ChartCard
            chartId="setup"
            title="ביצועי סטאפ"
            ariaLabel="גרף עמודות: ביצועי כל סוג סטאפ — R ממוצע ואחוז הצלחה"
            fullWidth
            defaultHeight={dh}
            info={CHART_INFO.setup}
            headerExtra={
              <div className="flex items-center gap-3 text-xs font-sans" dir="rtl">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={setupSeries.avgR}
                    onChange={e => setSetupSeries(p => ({ ...p, avgR: e.target.checked }))}
                    className="accent-[#FFB800]" />
                  <span className="text-[#E0E0E0]">Avg R</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={setupSeries.winRate}
                    onChange={e => setSetupSeries(p => ({ ...p, winRate: e.target.checked }))}
                    className="accent-[#888888]" />
                  <span className="text-[#E0E0E0]">Win Rate (חצי-שקוף)</span>
                </label>
              </div>
            }
            footerExtra={
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 text-xs font-sans" dir="rtl">
                {chartData.setup.map((entry, i) => (
                  <div key={entry.setupType} className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      style={{
                        background: SETUP_COLORS[i % SETUP_COLORS.length],
                        width: 12, height: 12, display: 'inline-block', borderRadius: 2,
                      }}
                    />
                    <span className="text-[#E0E0E0]">{entry.setupType}</span>
                  </div>
                ))}
              </div>
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.setup}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="setupType" hide />
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
                  cursor={{ fill: '#FFFFFF', fillOpacity: 0.04 }}
                  content={({ payload, active }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload as { setupType: string; avgR: number; winRate: number }
                    return (
                      <div style={TOOLTIP_STYLE} dir="rtl" className="px-3 py-2 rounded">
                        <p className="text-[#E0E0E0] font-bold text-sm">{row.setupType}</p>
                        {payload.map(p => (
                          <p key={String(p.dataKey)} className="text-xs" style={{ color: p.color }}>
                            {p.dataKey === 'winRate'
                              ? `Win Rate: ${(Number(p.value) * 100).toFixed(1)}%`
                              : `Avg R: ${ltr(`${Number(p.value) >= 0 ? '+' : ''}${Number(p.value).toFixed(2)}R`)}`}
                          </p>
                        ))}
                      </div>
                    )
                  }}
                />
                {setupSeries.avgR && (
                  <Bar yAxisId="r" dataKey="avgR" name="avgR" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {chartData.setup.map((_, i) => (
                      <Cell key={i} fill={SETUP_COLORS[i % SETUP_COLORS.length]} />
                    ))}
                  </Bar>
                )}
                {setupSeries.winRate && (
                  <Bar yAxisId="wr" dataKey="winRate" name="winRate" radius={[3, 3, 0, 0]} opacity={0.5} isAnimationActive={false}>
                    {chartData.setup.map((_, i) => (
                      <Cell key={i} fill={SETUP_COLORS[i % SETUP_COLORS.length]} />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )
      case 'ticker':
        return (
          <ChartCard chartId="ticker" title="P&L לפי נייר" ariaLabel="גרף עמודות אופקי: רווח והפסד מצטבר לכל נייר" defaultHeight={dh} info={CHART_INFO.ticker}>
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
        )
      case 'holdtime':
        return (
          <ChartCard chartId="holdtime" title="זמן החזקה vs R" ariaLabel="גרף פיזור: זמן החזקת הטרייד מול מכפיל R, מסומן לפי תוצאה" defaultHeight={dh} info={CHART_INFO.holdtime}>
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
                  label={{ value: 'זמן', position: 'insideBottom', offset: -10, fill: '#B0B0B0', fontSize: 11 }}
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
                        <p className="text-[#B0B0B0] text-sm">
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
                    <span style={{ color: '#B0B0B0', fontSize: 12 }}>{v}</span>
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
        )
      case 'dayhour':
        return (
          <ChartCard chartId="dayhour" defaultHeight={dh} title="P&L לפי יום/שעה" ariaLabel="גרפי עמודות: רווח והפסד לפי יום בשבוע ולפי שעת סגירה" info={CHART_INFO.dayhour}>
            <DayHourInner dayofweek={chartData.dayofweek} hour={chartData.hour} />
          </ChartCard>
        )
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full relative">
      {/* Inner region (not <main> — the dashboard layout already provides the single main landmark) */}
      <div className="flex-1 overflow-auto p-6" dir="rtl">

        {/* ── Filter bar ──────────────────────────────────────────────────────── */}
        <div className="panel p-4 mb-6">
          <h2 className="text-[#E0E0E0] text-sm font-sans font-semibold mb-3">סינון</h2>
          <div className="flex flex-wrap gap-3 items-end">

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-date-from" className="text-[#B0B0B0] text-sm font-sans">מתאריך</label>
              <div className="relative">
                <input id="filter-date-from" type="date" lang="en-GB"
                  data-empty={!dateFrom}
                  value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="input-base date-uppercase text-sm font-mono w-36" dir="ltr" />
                {!dateFrom && (
                  <span aria-hidden="true"
                    className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none text-sm font-mono text-[#B0B0B0] tracking-tight">
                    DD / MM / YYYY
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-date-to" className="text-[#B0B0B0] text-sm font-sans">עד תאריך</label>
              <div className="relative">
                <input id="filter-date-to" type="date" lang="en-GB"
                  data-empty={!dateTo}
                  value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="input-base date-uppercase text-sm font-mono w-36" dir="ltr" />
                {!dateTo && (
                  <span aria-hidden="true"
                    className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none text-sm font-mono text-[#B0B0B0] tracking-tight">
                    DD / MM / YYYY
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-ticker" className="text-[#B0B0B0] text-sm font-sans">טיקר</label>
              <input id="filter-ticker" type="text" placeholder="AAPL..." value={tickerFilter}
                onChange={e => setTickerFilter(e.target.value)}
                className="input-base text-sm font-mono w-24" dir="ltr" />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-setup" className="text-[#B0B0B0] text-sm font-sans">סטאפ</label>
              <select id="filter-setup" value={setupFilter} onChange={e => setSetupFilter(e.target.value)}
                className="input-base text-sm font-sans">
                <option value="all">הכל</option>
                {setupTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-direction" className="text-[#B0B0B0] text-sm font-sans">כיוון</label>
              <select id="filter-direction" value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}
                className="input-base text-sm font-sans">
                <option value="all">הכל</option>
                <option value="Long">Long</option>
                <option value="Short">Short</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="filter-result" className="text-[#B0B0B0] text-sm font-sans">תוצאה</label>
              <select id="filter-result" value={resultFilter} onChange={e => setResultFilter(e.target.value)}
                className="input-base text-sm font-sans">
                <option value="all">הכל</option>
                <option value="Win">Win</option>
                <option value="Loss">Loss</option>
                <option value="Breakeven">Breakeven</option>
              </select>
            </div>

            <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-execqual-label">
              <span id="filter-execqual-label" className="text-[#B0B0B0] text-sm font-sans">איכות ביצוע (1-10)</span>
              <div className="flex gap-1 items-center">
                <input type="number" aria-label="איכות ביצוע מינימלית" placeholder="מינ׳" min={1} max={10} value={execQualMin}
                  onChange={e => setExecQualMin(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
                <span className="text-[#B0B0B0] text-sm" aria-hidden="true">–</span>
                <input type="number" aria-label="איכות ביצוע מקסימלית" placeholder="מקס׳" min={1} max={10} value={execQualMax}
                  onChange={e => setExecQualMax(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
              </div>
            </div>

            <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-hold-label">
              <span id="filter-hold-label" className="text-[#B0B0B0] text-sm font-sans">
                זמן החזקה ({holdUnit === 'days' ? 'ימים' : 'שעות'})
              </span>
              <div className="flex gap-1 items-center">
                <input type="number" aria-label={`זמן החזקה מינימלי ב${holdUnit === 'days' ? 'ימים' : 'שעות'}`}
                  placeholder="מינ׳" min={0} value={holdHoursMin}
                  onChange={e => setHoldHoursMin(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
                <span className="text-[#B0B0B0] text-sm" aria-hidden="true">–</span>
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

            <div className="flex flex-col gap-1" role="group" aria-labelledby="filter-r-label">
              <span id="filter-r-label" className="text-[#B0B0B0] text-sm font-sans">סינון לפי R</span>
              <div className="flex gap-2 items-center">
                <span className="text-[#B0B0B0] text-sm font-sans">מ:</span>
                <input type="number" step="0.1" aria-label="R מינימלי" placeholder="—" value={rMin}
                  onChange={e => setRMin(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
                <span className="text-[#B0B0B0] text-sm font-sans">עד:</span>
                <input type="number" step="0.1" aria-label="R מקסימלי" placeholder="—" value={rMax}
                  onChange={e => setRMax(e.target.value)}
                  className="input-base text-sm font-mono w-16" dir="ltr" />
              </div>
            </div>

            <div className="flex-1" />
            <div className="flex items-end gap-2">
              {hasActiveFilter && (
                <button onClick={resetFilters}
                  className="btn-ghost px-3 py-1.5 text-sm font-sans border border-[#333333] rounded text-[#B0B0B0]">
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
            {chartRows.map((row, ri) => {
              if (row.type === 'pair') {
                const ratio = rowRatios[row.pairKey] ?? 0.5
                const [a, b] = row.chartIds
                const pairDh = Math.max(chartDefaultHeight(a), chartDefaultHeight(b))
                return (
                  <PairRow key={row.pairKey} pairKey={row.pairKey} initialRatio={ratio} onRatioCommit={handleRatioCommit}>
                    {renderChart(a, pairDh)}
                    {renderChart(b, pairDh)}
                  </PairRow>
                )
              }
              const id = row.chartId
              return <div key={id}>{renderChart(id)}</div>
            })}
          </div>
        )}
        </div>
        {/* /aria-live results region */}
      </div>

    </div>
  )
}
