/**
 * Research dashboard — pure helpers, types, and localStorage adapters.
 *
 * No React, no DOM. Shared between the entry component and the chart
 * primitives so neither side imports the other's React tree.
 */

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

/** Convert raw Supabase row → ClosedTrade; returns null when required fields are missing. */
export function toClosedTrade(t: RawClosedTrade): ClosedTrade | null {
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

export const CHART_IDS = ['equity', 'rdist', 'setup', 'ticker', 'holdtime', 'dayhour'] as const
export type ChartId = typeof CHART_IDS[number]

export const CHART_LABELS: Record<ChartId, string> = {
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
const LS_KEY_ROW_RATIOS = 'research_row_ratios'
const LS_KEY_FILTER_COLLAPSED = 'research_filter_collapsed'
const LS_KEY_METRICS_COLLAPSED = 'research_metrics_collapsed'

export const LS_KEYS = {
  visibility: LS_KEY,
  holdUnit:   LS_KEY_HOLD_UNIT,
  setupSeries: LS_KEY_SETUP_SERIES,
  chartHeights: LS_KEY_CHART_HEIGHTS,
  rowRatios:    LS_KEY_ROW_RATIOS,
  filterCollapsed:  LS_KEY_FILTER_COLLAPSED,
  metricsCollapsed: LS_KEY_METRICS_COLLAPSED,
} as const

export function loadBoolPref(key: string): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === 'true') return true
    if (v === 'false') return false
  } catch {}
  return false
}

export function defaultVisibility(): Record<ChartId, boolean> {
  return Object.fromEntries(CHART_IDS.map(id => [id, true])) as Record<ChartId, boolean>
}

export function loadChartVisibility(): Record<ChartId, boolean> {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) return { ...defaultVisibility(), ...JSON.parse(stored) }
  } catch {}
  return defaultVisibility()
}

export type HoldUnit = 'hours' | 'days'
export function loadHoldUnit(): HoldUnit {
  try {
    const v = localStorage.getItem(LS_KEY_HOLD_UNIT)
    if (v === 'days' || v === 'hours') return v
  } catch {}
  return 'hours'
}

export interface SetupSeries { avgR: boolean; winRate: boolean }
export const defaultSetupSeries: SetupSeries = { avgR: true, winRate: true }
export function loadSetupSeries(): SetupSeries {
  try {
    const v = localStorage.getItem(LS_KEY_SETUP_SERIES)
    if (v) return { ...defaultSetupSeries, ...JSON.parse(v) }
  } catch {}
  return defaultSetupSeries
}

export interface ChartSize { w?: number; h?: number }

/** Read all persisted chart sizes. Migrates legacy number entries (height-only) to {h}. */
export function loadChartSizes(): Record<string, ChartSize> {
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

export function saveChartSize(chartId: string, size: ChartSize) {
  try {
    const cur = loadChartSizes()
    cur[chartId] = { ...cur[chartId], ...size }
    localStorage.setItem(LS_KEY_CHART_HEIGHTS, JSON.stringify(cur))
  } catch {}
}

export function loadRowRatios(): Record<string, number> {
  try {
    const v = localStorage.getItem(LS_KEY_ROW_RATIOS)
    if (v) return JSON.parse(v) as Record<string, number>
  } catch {}
  return {}
}

export function saveRowRatio(pairKey: string, ratio: number) {
  try {
    const cur = loadRowRatios()
    cur[pairKey] = ratio
    localStorage.setItem(LS_KEY_ROW_RATIOS, JSON.stringify(cur))
  } catch {}
}

// ─── Row grouping ────────────────────────────────────────────────────────────

export const FULLWIDTH_CHARTS = new Set<ChartId>(['setup'])

export type ChartRow =
  | { type: 'full'; chartId: ChartId }
  | { type: 'pair'; chartIds: [ChartId, ChartId]; pairKey: string }
  | { type: 'solo'; chartId: ChartId }

export function groupChartsIntoRows(vis: Record<ChartId, boolean>): ChartRow[] {
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
