'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TradeDetailModal, type TradeModalMode } from './trade-detail-modal'
import { ManualCloseModal } from './manual-close-modal'
import { cn } from '@/lib/utils/cn'
import { formatUsd } from '@/lib/utils/position-calc'

const PAGE_SIZE = 25

export interface RawTrade {
  id: string
  ticker: string
  direction: string
  status: string
  source: string
  closeReason: string | null
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
  totalQuantity: number
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
  const [status, setStatus] = useState(initialParams.status ?? 'All')
  const [sortCol, setSortCol] = useState<SortCol>((initialParams.sort as SortCol) ?? 'closedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>((initialParams.sortDir as 'asc' | 'desc') ?? 'desc')
  const [page, setPage] = useState(Number(initialParams.page ?? '0'))
  const [selected, setSelected] = useState<{ trade: RawTrade; mode: TradeModalMode } | null>(null)
  const [closing, setClosing] = useState<RawTrade | null>(null)

  // Optimistic-update layer (manual equivalent of React 19's useOptimistic, which
  // isn't available in React 18.3). We keep a map of pending field-patches keyed by
  // trade id, merge them onto the server `trades` at render time, and clear each
  // patch only once the server data has actually caught up. This is race-safe: a
  // stale router.refresh() response can't revert a newer optimistic change, because
  // the patch survives until the incoming server row genuinely reflects it.
  const [pendingPatches, setPendingPatches] = useState<Record<string, Partial<RawTrade>>>({})

  useEffect(() => {
    setPendingPatches(prev => {
      const ids = Object.keys(prev)
      if (ids.length === 0) return prev
      let changed = false
      const next: Record<string, Partial<RawTrade>> = {}
      for (const id of ids) {
        const server = trades.find(t => t.id === id)
        if (!server) { changed = true; continue } // trade no longer exists → drop patch
        const patch = prev[id]
        const reflected = (Object.keys(patch) as (keyof RawTrade)[]).every(
          k => server[k] === patch[k]
        )
        if (reflected) changed = true
        else next[id] = patch
      }
      return changed ? next : prev
    })
  }, [trades])

  function patchTrade(id: string, patch: Partial<RawTrade>) {
    setPendingPatches(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    router.refresh()
  }

  const effectiveTrades = useMemo(() => {
    if (Object.keys(pendingPatches).length === 0) return trades
    return trades.map(t => (pendingPatches[t.id] ? { ...t, ...pendingPatches[t.id] } : t))
  }, [trades, pendingPatches])

  const setups = useMemo(
    () => [...new Set(effectiveTrades.map(t => t.setupType).filter((s): s is string => s !== null))].sort(),
    [effectiveTrades]
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
    setSetup(''); setRMin(''); setRMax(''); setStatus('All')
    setSortCol('closedAt'); setSortDir('desc'); setPage(0)
    router.replace('/search', { scroll: false })
  }

  const hasFilters = q || from || to || direction || filterResult || setup || rMin || rMax || status !== 'All'

  const filtered = useMemo(() => {
    return effectiveTrades.filter(t => {
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
  }, [effectiveTrades, status, q, from, to, direction, filterResult, setup, rMin, rMax])

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
              aria-label="חיפוש טיקר או הערות"
              value={q}
              onChange={e => bump(() => setQ(e.target.value))}
              className={inputCls + ' w-44'}
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#888888]">מ׳</span>
              <input type="date" aria-label="מתאריך" value={from} onChange={e => bump(() => setFrom(e.target.value))} className={inputCls} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#888888]">עד</span>
              <input type="date" aria-label="עד תאריך" value={to} onChange={e => bump(() => setTo(e.target.value))} className={inputCls} />
            </div>
            <select value={direction} aria-label="כיוון" onChange={e => bump(() => setDirection(e.target.value))} className={selectCls}>
              <option value="">כל כיוון</option>
              <option value="Long">Long</option>
              <option value="Short">Short</option>
            </select>
            <select value={filterResult} aria-label="תוצאה" onChange={e => bump(() => setFilterResult(e.target.value))} className={selectCls}>
              <option value="">כל תוצאה</option>
              <option value="Win">Win</option>
              <option value="Loss">Loss</option>
              <option value="Breakeven">Breakeven</option>
            </select>
            <select value={setup} aria-label="סטאפ" onChange={e => bump(() => setSetup(e.target.value))} className={selectCls}>
              <option value="">כל סטאפ</option>
              {setups.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Row 2 */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#888888]">R מ׳</span>
              <input type="number" step="0.1" aria-label="R מינימלי" value={rMin} onChange={e => bump(() => setRMin(e.target.value))} className={inputCls + ' w-20'} placeholder="—" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#888888]">R עד</span>
              <input type="number" step="0.1" aria-label="R מקסימלי" value={rMax} onChange={e => bump(() => setRMax(e.target.value))} className={inputCls + ' w-20'} placeholder="—" />
            </div>
            <select value={status} aria-label="סטטוס" onChange={e => bump(() => setStatus(e.target.value))} className={selectCls}>
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
              {filtered.length} / {effectiveTrades.length} טריידים
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
                <th className="px-3 py-2 text-right text-xs font-mono text-[#888888]">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[#555555] text-sm">
                    לא נמצאו טריידים
                  </td>
                </tr>
              )}
              {pageItems.map(t => {
                const canManualClose = t.source === 'manual' && t.status === 'Open'
                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelected({ trade: t, mode: 'view' })}
                    className="border-b border-[#1A1A1A] hover:bg-[#141414] cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-[#E0E0E0] whitespace-nowrap">
                      {t.ticker}
                      {t.source === 'manual' && <span className="text-[#FFB800] text-[10px] mr-1">●</span>}
                    </td>
                    <td className={cn('px-3 py-2 font-mono text-xs', t.direction === 'Long' ? 'text-[#2CC84A]' : 'text-[#FF4D4D]')}>
                      {t.direction}
                    </td>
                    <td className="px-3 py-2 text-[#888888] text-xs">{t.setupType ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[#888888] whitespace-nowrap">{fmtDate(t.openedAt)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[#888888] whitespace-nowrap">{fmtDate(t.closedAt)}</td>
                    <td
                      title={t.actualR == null ? 'אין stop price מוגדר' : undefined}
                      className={cn('px-3 py-2 font-mono text-xs whitespace-nowrap',
                        t.actualR != null && t.actualR > 0 ? 'text-[#2CC84A]' :
                        t.actualR != null && t.actualR < 0 ? 'text-[#FF4D4D]' : 'text-[#888888]'
                      )}
                    >
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
                    <td className="px-3 py-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelected({ trade: t, mode: 'edit' })}
                          title="עריכת הערות"
                          className="text-[#888888] hover:text-[#FFB800] transition-colors p-1 border border-[#222222] rounded"
                        >
                          {/* pencil icon */}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        {canManualClose && (
                          <button
                            type="button"
                            onClick={() => setClosing(t)}
                            title="סגירת טרייד"
                            className="text-[#888888] hover:text-[#2CC84A] transition-colors p-1 border border-[#222222] rounded"
                          >
                            {/* dollar/close icon */}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="1" x2="12" y2="23" />
                              <path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
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
          trade={selected.trade}
          mode={selected.mode}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setSelected({ trade: updated, mode: selected.mode })
            // Patch only the soft fields that the edit modal can change, so a
            // lingering patch can never mask future server updates to other fields.
            patchTrade(updated.id, {
              notes: updated.notes,
              setupType: updated.setupType,
              emotionalState: updated.emotionalState,
              executionQuality: updated.executionQuality,
              stopPrice: updated.stopPrice,
              targetPrice: updated.targetPrice,
              didRight: updated.didRight,
              wouldChange: updated.wouldChange,
            })
          }}
        />
      )}

      {closing && (
        <ManualCloseModal
          trade={closing}
          onClose={() => setClosing(null)}
          onClosed={(closedId) => {
            // Optimistically mark the trade Closed so its row leaves the
            // "Open only" filter immediately; patchTrade also triggers the
            // server refresh that will clear the patch once data catches up.
            patchTrade(closedId, { status: 'Closed' })
            setClosing(null)
          }}
        />
      )}
    </>
  )
}
