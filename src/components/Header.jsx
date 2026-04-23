import { calcStats } from '../utils/calculations'

const TABS = [
  { id: 'dashboard', label: '📊 דשבורד' },
  { id: 'log', label: '📋 יומן עסקאות' },
  { id: 'add', label: '➕ עסקה חדשה' },
]

export default function Header({ trades, activeTab, onTabChange, onClear, apiKey, onApiKeyChange }) {
  const stats = calcStats(trades)

  return (
    <header className="shrink-0 border-b border-[#222] bg-[#080808] z-10">
      <div className="flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-4">
          <span className="font-bold text-base tracking-tight font-mono">TRADE_ANALYST</span>
          <div className="flex gap-2 text-xs">
            <Chip label="עסקאות" value={stats.total} />
            {stats.closed > 0 && (
              <>
                <Chip
                  label="Win Rate"
                  value={`${stats.winRate.toFixed(1)}%`}
                  color={stats.winRate >= 50 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}
                />
                <Chip
                  label="Total R"
                  value={`${stats.totalR >= 0 ? '+' : ''}${stats.totalR.toFixed(2)}R`}
                  color={stats.totalR >= 0 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]'}
                />
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="password"
            placeholder="Gemini API Key"
            value={apiKey}
            onChange={e => onApiKeyChange(e.target.value)}
            className="bg-[#111] border border-[#333] text-xs text-[#888] px-2 py-1 rounded w-44 focus:outline-none focus:border-[#FFB800]"
          />
          {trades.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs border border-red-900/50 text-red-500 px-3 py-1 hover:bg-red-950/20 transition-colors rounded"
            >
              נקה הכל
            </button>
          )}
        </div>
      </div>
      <div className="flex px-6 gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`px-4 py-2 text-xs transition-all border-b-2 ${
              activeTab === t.id
                ? 'border-[#FFB800] text-[#FFB800] font-semibold opacity-100'
                : 'border-transparent text-[#888] hover:text-white opacity-70 hover:opacity-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </header>
  )
}

function Chip({ label, value, color = 'text-white' }) {
  return (
    <span className="bg-zinc-900 border border-[#222] px-2 py-0.5 rounded flex items-center gap-1.5">
      <span className="text-[#555]">{label}:</span>
      <span className={`font-mono font-semibold ${color}`}>{value}</span>
    </span>
  )
}
