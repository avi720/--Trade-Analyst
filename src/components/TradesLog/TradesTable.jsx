import { useState } from 'react'

const RESULT_COLOR = { Win: 'text-[#2CC84A]', Loss: 'text-[#FF4D4D]', Breakeven: 'text-[#888]', Open: 'text-[#FFB800]' }
const RESULT_HE = { Win: 'רווח', Loss: 'הפסד', Breakeven: 'מאוזן', Open: 'פתוח' }
const SETUP_HE = { breakout: 'פריצה', pullback_ema: 'פולבק EMA', range: 'טווח', vcp: 'VCP', other: 'אחר' }

const TH_CLS = 'text-[10px] uppercase tracking-wider text-[#888] font-semibold py-3 px-3 border-b border-[#222] whitespace-nowrap cursor-pointer select-none hover:text-white transition-colors'
const TD_CLS = 'py-2 px-3 border-b border-[#1a1a1a] text-sm align-top'

function SortIcon({ dir }) {
  if (!dir) return <span className="ml-1 text-[#444]">↕</span>
  return <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function TradesTable({ trades, onDelete }) {
  const [sort, setSort] = useState({ col: 'date', dir: 'desc' })

  function toggleSort(col) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' })
  }

  const sorted = [...trades].sort((a, b) => {
    let av = a[sort.col] ?? '', bv = b[sort.col] ?? ''
    if (typeof av === 'number') return sort.dir === 'asc' ? av - bv : bv - av
    return sort.dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
  })

  function th(label, col) {
    return (
      <th className={TH_CLS} onClick={() => toggleSort(col)}>
        {label}<SortIcon dir={sort.col === col ? sort.dir : null} />
      </th>
    )
  }

  if (!trades.length) return (
    <div className="flex items-center justify-center py-16 text-[#444] text-sm">אין עסקאות תואמות</div>
  )

  return (
    <div className="overflow-x-auto rounded border border-[#222]">
      <table className="w-full text-right min-w-[1100px]">
        <thead>
          <tr>
            {th('תאריך', 'date')}
            {th('סימול', 'ticker')}
            {th('כיוון', 'direction')}
            {th('סטאפ', 'setup_type')}
            {th('כניסה', 'entry_price')}
            {th('סטופ', 'stop_price')}
            {th('יעד', 'target_price')}
            {th('R מתוכנן', 'r_multiple_entry')}
            {th('יציאה', 'exit_price')}
            {th('תוצאה', 'result')}
            {th('R בפועל', 'actual_r')}
            {th('ביצוע', 'execution_quality')}
            <th className={TH_CLS}>רגש</th>
            <th className={TH_CLS}>פעולות</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(t => (
            <tr key={t.id} className="hover:bg-[#0d0d0d] transition-colors group">
              <td className={TD_CLS + ' text-[#888] font-mono text-xs'}>{t.date}</td>
              <td className={TD_CLS + ' font-bold font-mono uppercase'}>{t.ticker}</td>
              <td className={TD_CLS + (t.direction === 'Long' ? ' text-[#2CC84A]' : ' text-[#FF4D4D]')}>{t.direction}</td>
              <td className={TD_CLS + ' text-[#888] text-xs'}>{SETUP_HE[t.setup_type] || t.setup_type || '—'}</td>
              <td className={TD_CLS + ' font-mono'}>{t.entry_price ? `$${t.entry_price}` : '—'}</td>
              <td className={TD_CLS + ' font-mono ' + (!t.stop_price ? 'text-[#FF4D4D]' : '')}>{t.stop_price ? `$${t.stop_price}` : 'חסר!'}</td>
              <td className={TD_CLS + ' font-mono'}>{t.target_price ? `$${t.target_price}` : '—'}</td>
              <td className={TD_CLS + ' font-mono text-[#FFB800]'}>{t.r_multiple_entry != null ? `${t.r_multiple_entry}R` : '—'}</td>
              <td className={TD_CLS + ' font-mono'}>{t.exit_price ? `$${t.exit_price}` : '—'}</td>
              <td className={TD_CLS + ' font-bold ' + (RESULT_COLOR[t.result] || '')}>{RESULT_HE[t.result] || '—'}</td>
              <td className={TD_CLS + ' font-bold font-mono ' + (t.actual_r > 0 ? 'text-[#2CC84A]' : t.actual_r < 0 ? 'text-[#FF4D4D]' : '')}>
                {t.actual_r != null ? `${t.actual_r > 0 ? '+' : ''}${t.actual_r}R` : '—'}
              </td>
              <td className={TD_CLS + ' font-mono text-center'}>{t.execution_quality ?? '—'}</td>
              <td className={TD_CLS + ' text-xs text-[#888] max-w-[120px] truncate'} title={t.emotional_state}>{t.emotional_state || '—'}</td>
              <td className={TD_CLS}>
                <button
                  onClick={() => onDelete(t.id)}
                  className="text-[#FF4D4D]/50 hover:text-[#FF4D4D] text-xs opacity-0 group-hover:opacity-100 transition-all"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
