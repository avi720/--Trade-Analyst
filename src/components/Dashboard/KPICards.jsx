export default function KPICards({ stats }) {
  const cards = [
    { label: 'סה"כ עסקאות', value: stats.total, sub: `${stats.closed} סגורות` },
    {
      label: 'Win Rate',
      value: stats.closed ? `${stats.winRate.toFixed(1)}%` : '—',
      color: stats.winRate >= 50 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]',
    },
    {
      label: 'Avg R (סגורות)',
      value: stats.closed ? `${stats.totalR >= 0 ? '+' : ''}${stats.totalR.toFixed(2)}R` : '—',
      color: stats.totalR >= 0 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]',
    },
    {
      label: 'Profit Factor',
      value: stats.profitFactor != null ? stats.profitFactor.toFixed(2) : '—',
      color: stats.profitFactor >= 1 ? 'text-[#2CC84A]' : 'text-[#FF4D4D]',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map(c => (
        <div key={c.label} className="bg-[#111] border border-[#222] rounded p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#888] mb-1">{c.label}</p>
          <p className={`text-2xl font-bold font-mono ${c.color || 'text-white'}`}>{c.value}</p>
          {c.sub && <p className="text-[10px] text-[#555] mt-1">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}
