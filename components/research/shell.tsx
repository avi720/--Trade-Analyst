/**
 * Research dashboard — shared UI primitives.
 *
 * `ChartCard` provides the resizable panel + title + ⓘ tooltip wrapper used by
 * every chart in the dashboard. `PairRow` arranges two charts side-by-side with
 * a draggable width ratio. `MetricCard` is the small numeric tile above the
 * charts. `DayHourInner` is the special-cased two-stack bar chart.
 *
 * Recharts and React-only — no business logic.
 */

'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { InfoTooltip } from '@/components/info-tooltip'
import { formatUsd } from '@/lib/utils/position-calc'
import { loadChartSizes, saveChartSize, type ChartId } from './lib'

// ─── Shared chart styling ─────────────────────────────────────────────────────

export const TOOLTIP_STYLE: React.CSSProperties = {
  background: '#111111',
  border: '1px solid #333333',
  color: '#E0E0E0',
  fontSize: 12,
  borderRadius: 4,
}
export const AXIS_TICK = { fill: '#B0B0B0', fontSize: 12 }
export const GRID_STROKE = '#1E1E1E'
export const AXIS_STROKE = '#333333'

/**
 * Distinct color palette for per-setup bars in the setup-performance chart.
 * Tuned for the dark theme (good contrast on #111 panel bg).
 */
export const SETUP_COLORS = [
  '#FFB800', // amber
  '#4DA6FF', // blue
  '#B36BFF', // purple
  '#2AD8D8', // cyan
  '#FF8A4D', // orange
  '#BFFF4D', // yellow-green
  '#FF4D8A', // pink
  '#4DFFB8', // mint
]

/**
 * The dashboard renders inside dir="rtl". Numeric/currency/R labels contain weak
 * bidi characters (-, +, $, <, >) that the RTL algorithm reorders, turning "-$2k"
 * into "2k-$" and "<-2R" into "2R->". Wrapping each label in LTR isolates
 * (U+2066 … U+2069) forces it to render left-to-right without affecting Hebrew
 * category labels (setup names, day names), which we leave untouched.
 */
const LRI = '⁦' // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩' // POP DIRECTIONAL ISOLATE
export const ltr = (s: string | number) => `${LRI}${s}${PDI}`

// Minimum user-resizable dimensions for chart cards.
export const MIN_CHART_W = 280
export const MIN_CHART_H = 150

// ─── ChartCard ────────────────────────────────────────────────────────────────

export interface ChartCardProps {
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

export function ChartCard({
  chartId, title, ariaLabel, info, headerExtra, footerExtra,
  defaultHeight = 220, pairPosition, onWidthDrag, onWidthDragEnd, children,
}: ChartCardProps) {
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

// ─── PairRow ──────────────────────────────────────────────────────────────────

export function PairRow({
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

// ─── DayHourInner ─────────────────────────────────────────────────────────────

/**
 * Day/hour double-chart inner content. Tracks its parent's height via
 * ResizeObserver and computes each Recharts ResponsiveContainer's numeric
 * height in pixels — using flex-1 with ResponsiveContainer height="100%"
 * causes Recharts to enter a layout loop on resize, so explicit pixel
 * heights are required.
 */
export function DayHourInner({
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

// ─── MetricCard ───────────────────────────────────────────────────────────────

export function MetricCard({ label, value, color, info }: { label: string; value: string; color?: string; info?: React.ReactNode }) {
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
