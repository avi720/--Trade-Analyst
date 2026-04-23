import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, LinearScale, CategoryScale, Tooltip } from 'chart.js'
import { setupPerformance } from '../../utils/calculations'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip)

const SETUP_LABELS = {
  breakout: 'פריצה', pullback_ema: 'פולבק EMA', range: 'טווח', vcp: 'VCP', other: 'אחר',
}

export default function SetupChart({ trades }) {
  const perf = setupPerformance(trades)
  if (!perf.length) return <Empty />

  const data = {
    labels: perf.map(p => SETUP_LABELS[p.setup] || p.setup),
    datasets: [{
      data: perf.map(p => p.winRate),
      backgroundColor: 'rgba(255,184,0,0.7)',
      borderRadius: 3,
    }],
  }

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw}% Win Rate` } } },
    scales: {
      x: { min: 0, max: 100, ticks: { color: '#666', callback: v => `${v}%` }, grid: { color: '#1a1a1a' } },
      y: { ticks: { color: '#aaa' }, grid: { display: false } },
    },
  }

  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 flex flex-col">
      <p className="text-xs uppercase tracking-widest text-[#888] mb-3">Win Rate לפי סטאפ</p>
      <div style={{ height: 180 }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 flex items-center justify-center" style={{ height: 230 }}>
      <p className="text-[#444] text-sm">סטאפים — אין נתונים</p>
    </div>
  )
}
