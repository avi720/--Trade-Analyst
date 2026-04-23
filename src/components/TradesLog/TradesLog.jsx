import { useState, useMemo } from 'react'
import TradeFilters from './TradeFilters'
import TradesTable from './TradesTable'
import ExportButtons from './ExportButtons'

const EMPTY_FILTERS = { search: '', direction: '', result: '', setup: '', month: '' }

export default function TradesLog({ trades, onDelete }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const filtered = useMemo(() => {
    return trades.filter(t => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (
          !t.ticker?.toLowerCase().includes(q) &&
          !t.emotional_state?.toLowerCase().includes(q) &&
          !t.did_right?.toLowerCase().includes(q) &&
          !t.would_change?.toLowerCase().includes(q)
        ) return false
      }
      if (filters.direction && t.direction !== filters.direction) return false
      if (filters.result && t.result !== filters.result) return false
      if (filters.setup && t.setup_type !== filters.setup) return false
      if (filters.month && t.date) {
        const parts = t.date.split('/')
        if (parts.length === 3) {
          const tradeMonth = `${parts[2]}-${parts[1].padStart(2, '0')}`
          if (tradeMonth !== filters.month) return false
        }
      }
      return true
    })
  }, [trades, filters])

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-zinc-300">
          יומן עסקאות <span className="text-sm text-[#888] font-normal">({filtered.length} מתוך {trades.length})</span>
        </h2>
        <ExportButtons trades={filtered} />
      </div>
      <TradeFilters filters={filters} onChange={setFilters} />
      <TradesTable trades={filtered} onDelete={onDelete} />
    </div>
  )
}
