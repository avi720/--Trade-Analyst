const SELECT_CLS = 'bg-[#1a1a1a] border border-[#333] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[#FFB800]'
const INPUT_CLS = 'bg-[#1a1a1a] border border-[#333] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[#FFB800] w-36'

export default function TradeFilters({ filters, onChange }) {
  const set = field => e => onChange({ ...filters, [field]: e.target.value })

  return (
    <div className="flex flex-wrap gap-2 items-center mb-4">
      <input
        type="text"
        placeholder="חיפוש סימול / הערות..."
        className={INPUT_CLS + ' w-48'}
        value={filters.search}
        onChange={set('search')}
      />
      <select className={SELECT_CLS} value={filters.direction} onChange={set('direction')}>
        <option value="">כיוון: הכל</option>
        <option value="Long">Long</option>
        <option value="Short">Short</option>
      </select>
      <select className={SELECT_CLS} value={filters.result} onChange={set('result')}>
        <option value="">תוצאה: הכל</option>
        <option value="Win">רווח</option>
        <option value="Loss">הפסד</option>
        <option value="Breakeven">מאוזן</option>
        <option value="Open">פתוח</option>
      </select>
      <select className={SELECT_CLS} value={filters.setup} onChange={set('setup')}>
        <option value="">סטאפ: הכל</option>
        <option value="breakout">פריצה</option>
        <option value="pullback_ema">פולבק EMA</option>
        <option value="range">טווח</option>
        <option value="vcp">VCP</option>
        <option value="other">אחר</option>
      </select>
      <input
        type="month"
        className={INPUT_CLS}
        value={filters.month}
        onChange={set('month')}
      />
      {Object.values(filters).some(v => v) && (
        <button
          className="text-xs text-[#888] hover:text-white transition-colors"
          onClick={() => onChange({ search: '', direction: '', result: '', setup: '', month: '' })}
        >
          נקה פילטרים ✕
        </button>
      )}
    </div>
  )
}
