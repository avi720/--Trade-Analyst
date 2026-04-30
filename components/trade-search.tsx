'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { TradeDetailModal } from './trade-detail-modal'
import { cn } from '@/lib/utils/cn'
import { formatUsd } from '@/lib/utils/position-calc'

const PAGE_SIZE = 25

export interface RawTrade {
  id: string
  ticker: string
  direction: string
  status: string
  setupType: string | null
  openedAt: string
  closedAt: string | null
  actualR: number | null
  realizedPnl: number | null
  totalCommission: number | null
  result: string | null
  notes: string | null
  emotionalState: string | null
  executionQuality: number | null
  stopPrice: number | null
  targetPrice: number | null
  didRight: string | null
  wouldChange: string | null
  avgEntryPrice: number
  avgExitPrice: number | null
  totalQuantityOpened: number
}

type SortCol = 'ticker' | 'direction' | 'setupType' | 'openedAt' | 'closedAt' | 'actualR' | 'realizedPnl'

interface Props {
  trades: RawTrade[]
  initialParams: Record<string, string>
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return s.slice(0, 10)
}

function fmtR(r: number | null): string {
  if (r == null) return '—'
  return (r >= 0 ? '+' : '') + r.toFixed(2) + 'R'
}

function resultColor(result: string | null, status: string): string {
  if (status === 'Open') return 'text-[#FFB800]'
  switch (result) {
    case 'Win': return 'text-[#2CC84A]'
    case 'Loss': return 'text-[#FF4D4D]'
    case 'Breakeven': return 'text-[#FFB800]'
    default: return 'text-[#888888]'
  }
}

function resultLabel(result: string | null, status: string): string {
  if (status === 'Open') return 'פתוח'
  return result ?? '—'
}

function SortTh({
  col, label, current, dir, onSort,
}: {
  col: SortCol; label: string; current: SortCol; dir: 'asc' | 'desc'; onSort: (c: SortCol) => void
}) {
  const active = current === col
  return (
    <th
      onClick={() => onSort(col)}
      className="cursor-pointer select-none px-3 py-2 text-right text-xs font-mono text-[#888888] hover:text-[#E0E0E0] whitespace-nowrap"
    >
      {label} <span className="opacity-60">{active ? (dir === 'desc' ? '↓' : '↑') : '↕'}</span>
    </th>
  )
}

export function TradeSearch({ trades, initialParams }: Props) {
  const router = useRouter()

  const [q, setQ] = useState(initialParams.q ?? '')
  const [from, setFrom] = useState(initialParams.from ?? '')
  const [to, setTo] = useState(initialParams.to ?? '')
  const [direction, setDirection] = useState(initialParams.direction ?? '')
  const [filterResult, setFilterResult] = useState(initialParams.result ?? '')
  const [setup, setSetup] = useState(initialParams.setup ?? '')
  const [rMin, setRMin] = useState(initialParams.rMin ?? '')
  const [rMax, setRMax] = useState(initialParams.rMax ?? '')
  const [status, setStatus] = useState(initialParams.status ?? 'Closed')
  const [sortCol, setSortCol] = useState<SortCol>((initialParams.sort as SortCol) ?? 'closedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>((initialParams.sortDir as 'asc' | 'desc') ?? 'desc')
  const [page, setPage] = useState(Number(initialParams.page ?? '0'))
  const [selected, setSelected] = useState<RawTrade | null>(null)

  const setups = useMemo(
    () => [...new Set(trades.map(t => t.setupType).filter((s): s is string => s !== null))].sort(),
    [trades]
  )

  function bump(fn: () => void) {
    fn()
    setPage(0)
  }

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
    setPage(0)
  }

  function clearFilters() {
    setQ(''); setFrom(''); setTo(''); setDirection(''); setFilterResult('')
    setSetup(''); setRMin(''); setRMax(''); setStatus('Closed')
    setSortCol('closedAt'); setSortDir('desc'); setPage(0)
    router.replace('/search', { scroll: false })
  }

  const hasFilters = q || from || to || direction || filterResult || setup || rMin || rMax || status !== 'Closed'

  const filtered = useMemo(() => {
    return trades.filter(t => {
      if (status === 'Closed' && t.status !== 'Closed') return false
      if (status === 'Open' && t.status !== 'Open') return false

      if (q) {
        const ql = q.toLowerCase()
        if (!t.ticker.toLowerCase().includes(ql) && !(t.notes?.toLowerCase().includes(ql))) return false
      }

      if (from && t.closedAt && t.closedAt < from) return false
      if (to && t.closedAt && t.closedAt > to + 'T23:59:59') return false

      if (direction && t.direction !== direction) return false
      if (filterResult && t.result !== filterResult) return false
      if (setup && t.setupType !== setup) return false

      const rMinN = rMin !== '' ? parseFloat(rMin) : null
      const rMaxN = rMax !== '' ? parseFloat(rMax) : null
      if (rMinN !== null && (t.actualR == null || t.actualR < rMinN)) return false
      if (rMaxN !== null && (t.actualR == null || t.actualR > rMaxN)) return false

      return true
    })
  }, [trades, status, q, from, to, direction, filterResult, setup, rMin, rMax])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortCol]
      const bv = b[sortCol]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [filtered, sortCol, sortDir])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const inputCls = 'bg-[#080808] border border-[#222222] rounded px-2 py-1 text-sm text-[#E0E0E0] placeholder-[#555555] focus:outline-none focus:border-[#444444]'
  const selectCls = inputCls + ' cursor-pointer'

  return (
    <>
      <div className="p-4 flex flex-col gap-4">
        {/* Filter bar */}
        <div className="panel p-4 flex flex-col gap-3">
          {/* Row 1 */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="חיפוש טיקר / הערות…"
              value={q}
              onChange={e => bump(() => setQ(e.target.value))}
              className={inputCls + ' w-44'}
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#888888]">מ׳</span>
              <input type="date" value={from} onChange={e => bump(() => setFrom(e.target.value))} className={inputCls} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#888888]">עד</span>
              <input type="date" value={to} onChange={e => bump(() => setTo(e.target.value))} className={inputCls} />
            </div>
            <select value={direction} onChange={e => bump(() => setDirection(e.target.value))} className={selectCls}>
              <option value="">כל כיוון</option>
              <option value="Long">Long</option>
              <option value="Short">Short</option>
            </select>
            <select value={filterResult} onChange={e => bump(() => setFilterResult(e.target.value))} className={selectCls}>
              <option value="">כל תוצאה</option>
              <option value="Win">Win</option>
              <option value="Loss">Loss</option>
              <option value="Breakeven">Breakeven</option>
            </select>
            <select value={setup} onChange={e => bump(() => setSetup(e.target.value))} className={selectCls}>
              <option value="">כל סטאפ</option>
              {setups.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Row 2 */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#888888]">R מ׳</span>
              <input type="number" step="0.1" value={rMin} onChange={e => bump(() => setRMin(e.target.value))} className={inputCls + ' w-20'} placeholder="—" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#888888]">R עד</span>
              <input type="number" step="0.1" value={rMax} onChange={e => bump(() => setRMax(e.target.value))} className={inputCls + ' w-20'} placeholder="—" />
            </div>
            <select value={status} onChange={e => bump(() => setStatus(e.target.value))} className={selectCls}>
              <option value="Closed">סגורים בלבד</option>
              <option value="Open">פתוחים בלבד</option>
              <option value="All">הכל</option>
            </select>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-[#888888] hover:text-[#FF4D4D] transition-colors px-2 py-1 border border-[#222222] rounded">
                נקה סינון
              </button>
            )}
            <span className="text-xs text-[#555555] mr-auto font-mono">
              {filtered.length} / {trades.length} טריידים
            </span>
          </div>
        </div>

        {/* Results table */}
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#222222]">
                <SortTh col="ticker"     label="טיקר"   current={sortCol} dir={sortDir} onSort={handleSort} />
                <SortTh col="direction"  label="כיוון"  current={sortCol} dir={sortDir} onSort={handleSort} />
                <SortTh col="setupType"  label="סטאפ"   current={sortCol} dir={sortDir} onSort={handleSort} />
                <SortTh col="openedAt"   label="פתיחה"  current={sortCol} dir={sortDir} onSort={handleSort} />
                <SortTh col="closedAt"   label="סגירה"  current={sortCol} dir={sortDir} onSort={handleSort} />
                <SortTh col="actualR"    label="R"      current={sortCol} dir={sortDir} onSort={handleSort} />
                <SortTh col="realizedPnl" label="P&L"  current={sortCol} dir={sortDir} onSort={handleSort} />
                <th className="px-3 py-2 text-right text-xs font-mono text-[#888888]">עמ׳</th>
                <th className="px-3 py-2 text-right text-xs font-mono text-[#888888]">תוצאה</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-[#555555] text-sm">
                    לא נמצאו טריידים
                  </td>
                </tr>
              )}
              {pageItems.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="border-b border-[#1A1A1A] hover:bg-[#141414] cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2 font-mono font-semibold text-[#E0E0E0] whitespace-nowrap">{t.ticker}</td>
                  <td className={cn('px-3 py-2 font-mono text-xs', t.direction === 'Long' ? 'text-[#2CC84A]' : 'text-[#FF4D4D]')}>
                    {t.direction}
                  </td>
                  <td className="px-3 py-2 text-[#888888] text-xs">{t.setupType ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[#888888] whitespace-nowrap">{fmtDate(t.openedAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[#888888] whitespace-nowrap">{fmtDate(t.closedAt)}</td>
                  <td className={cn('px-3 py-2 font-mono text-xs whitespace-nowrap',
                    t.actualR != null && t.actualR > 0 ? 'text-[#2CC84A]' :
                    t.actualR != null && t.actualR < 0 ? 'text-[#FF4D4D]' : 'text-[#888888]'
                  )}>
                    {fmtR(t.actualR)}
                  </td>
                  <td className={cn('px-3 py-2 font-mono text-xs whitespace-nowrap',
                    t.realizedPnl != null && t.realizedPnl > 0 ? 'text-[#2CC84A]' :
                    t.realizedPnl != null && t.realizedPnl < 0 ? 'text-[#FF4D4D]' : 'text-[#888888]'
                  )}>
                    {t.realizedPnl != null ? formatUsd(t.realizedPnl) : '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[#888888]">
                    {t.totalCommission != null ? formatUsd(-Math.abs(t.totalCommission)) : '—'}
                  </td>
                  <td className={cn('px-3 py-2 text-xs font-mono', resultColor(t.result, t.status))}>
                    {resultLabel(t.result, t.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-sm font-mono border border-[#222222] rounded text-[#888888] hover:text-[#E0E0E0] hover:border-[#444444] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← הקודם
            </button>
            <span className="text-xs text-[#888888] font-mono">
              {page + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="px-3 py-1 text-sm font-mono border border-[#222222] rounded text-[#888888] hover:text-[#E0E0E0] hover:border-[#444444] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              הבא →
            </button>
          </div>
        )}
      </div>

      {selected && (
        <TradeDetailModal
          trade={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setSelected(updated)
          }}
        />
      )}
    </>
  )
}
