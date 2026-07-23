/**
 * Research dashboard — the six chart bodies.
 *
 * Each chart is extracted as a named, `React.memo`'d functional component that
 * receives only the data slice it needs. `renderChart` is a thin dispatch that
 * picks the right component based on `id`. This lets the parent's memoized
 * `chartData` slices short-circuit re-renders on unrelated updates (e.g.
 * toggling one chart's height should not force the equity chart to re-run
 * Recharts layout).
 */

'use client'

import React from 'react'
import {
  LineChart, Line,
  BarChart, Bar,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine,
} from 'recharts'
import { formatUsd } from '@/lib/utils/position-calc'
import { CHART_INFO } from '@/components/research-info'
import { ChartCard, DayHourInner, ltr, SETUP_COLORS, TOOLTIP_STYLE, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, AXIS_TICK, GRID_STROKE, AXIS_STROKE } from './shell'
import type { ChartId, SetupSeries } from './lib'

export interface ChartData {
  equity:    { date: number; cumulativeR: number }[]
  rdist:     { label: string; count: number }[]
  setup:     { setupType: string; avgR: number; winRate: number }[]
  ticker:    { ticker: string; totalPnl: number }[]
  holdWins:  { holdHours: number; actualR: number; ticker: string; result: string }[]
  holdLoss:  { holdHours: number; actualR: number; ticker: string; result: string }[]
  holdOther: { holdHours: number; actualR: number; ticker: string; result: string }[]
  dayofweek: { day: string; totalPnl: number; tradeCount: number }[]
  hour:      { hour: number; totalPnl: number; tradeCount: number }[]
}

interface RenderChartArgs {
  id: ChartId
  data: ChartData
  defaultHeight: number
  setupSeries: SetupSeries
  onSetupSeriesChange: (next: SetupSeries) => void
}

// ─── EquityChart ──────────────────────────────────────────────────────────────

export const EquityChart = React.memo(function EquityChart({
  data, defaultHeight: dh,
}: {
  data: ChartData['equity']
  defaultHeight: number
}) {
  return (
    <ChartCard chartId="equity" title="עקומת הון (R מצטבר)" ariaLabel="גרף עקומת הון: R מצטבר לאורך זמן" defaultHeight={dh} info={CHART_INFO.equity}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
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
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            labelFormatter={v => new Date(v as number).toLocaleDateString('he-IL')}
            formatter={(v: number) => [ltr(`${v >= 0 ? '+' : ''}${v.toFixed(2)}R`), 'R מצטבר']}
          />
          <ReferenceLine y={0} stroke="#444444" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="cumulativeR" stroke="#FFB800" dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})
EquityChart.displayName = 'EquityChart'

// ─── RDistributionChart ───────────────────────────────────────────────────────

export const RDistributionChart = React.memo(function RDistributionChart({
  data, defaultHeight: dh,
}: {
  data: ChartData['rdist']
  defaultHeight: number
}) {
  return (
    <ChartCard chartId="rdist" title="התפלגות R" ariaLabel="גרף עמודות: התפלגות הטריידים לפי מכפיל R" defaultHeight={dh} info={CHART_INFO.rdist}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" stroke={AXIS_STROKE} tick={AXIS_TICK} tickMargin={6} tickFormatter={ltr} />
          <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} tickMargin={6} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [v, 'טריידים']} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((entry, i) => (
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
})
RDistributionChart.displayName = 'RDistributionChart'

// ─── SetupPerformanceChart ────────────────────────────────────────────────────

export const SetupPerformanceChart = React.memo(function SetupPerformanceChart({
  data, defaultHeight: dh, setupSeries, onSetupSeriesChange,
}: {
  data: ChartData['setup']
  defaultHeight: number
  setupSeries: SetupSeries
  onSetupSeriesChange: (next: SetupSeries) => void
}) {
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
              onChange={e => onSetupSeriesChange({ ...setupSeries, avgR: e.target.checked })}
              className="accent-amber" />
            <span className="text-text-main">Avg R</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={setupSeries.winRate}
              onChange={e => onSetupSeriesChange({ ...setupSeries, winRate: e.target.checked })}
              className="accent-text-mute" />
            <span className="text-text-main">Win Rate (חצי-שקוף)</span>
          </label>
        </div>
      }
      footerExtra={
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 text-xs font-sans" dir="rtl">
          {data.map((entry, i) => (
            <div key={entry.setupType} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                style={{
                  background: SETUP_COLORS[i % SETUP_COLORS.length],
                  width: 12, height: 12, display: 'inline-block', borderRadius: 2,
                }}
              />
              <span className="text-text-main">{entry.setupType}</span>
            </div>
          ))}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
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
                  <p className="text-text-main font-bold text-sm">{row.setupType}</p>
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
              {data.map((_, i) => (
                <Cell key={i} fill={SETUP_COLORS[i % SETUP_COLORS.length]} />
              ))}
            </Bar>
          )}
          {setupSeries.winRate && (
            <Bar yAxisId="wr" dataKey="winRate" name="winRate" radius={[3, 3, 0, 0]} opacity={0.5} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={SETUP_COLORS[i % SETUP_COLORS.length]} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})
SetupPerformanceChart.displayName = 'SetupPerformanceChart'

// ─── PnlByTickerChart ─────────────────────────────────────────────────────────

export const PnlByTickerChart = React.memo(function PnlByTickerChart({
  data, defaultHeight: dh,
}: {
  data: ChartData['ticker']
  defaultHeight: number
}) {
  return (
    <ChartCard chartId="ticker" title="P&L לפי נייר" ariaLabel="גרף עמודות אופקי: רווח והפסד מצטבר לכל נייר" defaultHeight={dh} info={CHART_INFO.ticker}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20 }}>
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
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [formatUsd(v), 'P&L']} />
          <ReferenceLine x={0} stroke="#444444" strokeDasharray="4 4" />
          <Bar dataKey="totalPnl" radius={[0, 3, 3, 0]} isAnimationActive={false}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.totalPnl >= 0 ? '#2CC84A' : '#FF4D4D'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})
PnlByTickerChart.displayName = 'PnlByTickerChart'

// ─── HoldTimeVsRChart ─────────────────────────────────────────────────────────

export const HoldTimeVsRChart = React.memo(function HoldTimeVsRChart({
  wins, losses, other, defaultHeight: dh,
}: {
  wins: ChartData['holdWins']
  losses: ChartData['holdLoss']
  other: ChartData['holdOther']
  defaultHeight: number
}) {
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
                  <p className="font-mono font-bold text-text-main text-sm">{p.ticker}</p>
                  <p className="text-text-dim text-sm">
                    {p.holdHours < 24 ? `${p.holdHours.toFixed(1)}h` : `${(p.holdHours / 24).toFixed(1)}d`}
                  </p>
                  <p className={`text-sm ${p.actualR >= 0 ? 'text-green' : 'text-red'}`}>
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
          <Scatter name="Win"  data={wins}   fill="#2CC84A" opacity={0.8} isAnimationActive={false} />
          <Scatter name="Loss" data={losses} fill="#FF4D4D" opacity={0.8} isAnimationActive={false} />
          {other.length > 0 && (
            <Scatter name="אחר" data={other}  fill="#888888" opacity={0.8} isAnimationActive={false} />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})
HoldTimeVsRChart.displayName = 'HoldTimeVsRChart'

// ─── DayHourChart ─────────────────────────────────────────────────────────────

export const DayHourChart = React.memo(function DayHourChart({
  dayofweek, hour, defaultHeight: dh,
}: {
  dayofweek: ChartData['dayofweek']
  hour: ChartData['hour']
  defaultHeight: number
}) {
  return (
    <ChartCard chartId="dayhour" defaultHeight={dh} title="P&L לפי יום/שעה" ariaLabel="גרפי עמודות: רווח והפסד לפי יום בשבוע ולפי שעת פתיחה" info={CHART_INFO.dayhour}>
      <DayHourInner dayofweek={dayofweek} hour={hour} />
    </ChartCard>
  )
})
DayHourChart.displayName = 'DayHourChart'

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export function renderChart({ id, data, defaultHeight: dh, setupSeries, onSetupSeriesChange }: RenderChartArgs): React.ReactElement {
  switch (id) {
    case 'equity':
      return <EquityChart data={data.equity} defaultHeight={dh} />
    case 'rdist':
      return <RDistributionChart data={data.rdist} defaultHeight={dh} />
    case 'setup':
      return (
        <SetupPerformanceChart
          data={data.setup}
          defaultHeight={dh}
          setupSeries={setupSeries}
          onSetupSeriesChange={onSetupSeriesChange}
        />
      )
    case 'ticker':
      return <PnlByTickerChart data={data.ticker} defaultHeight={dh} />
    case 'holdtime':
      return (
        <HoldTimeVsRChart
          wins={data.holdWins}
          losses={data.holdLoss}
          other={data.holdOther}
          defaultHeight={dh}
        />
      )
    case 'dayhour':
      return <DayHourChart dayofweek={data.dayofweek} hour={data.hour} defaultHeight={dh} />
  }
}
