import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, LinearScale, CategoryScale, Tooltip } from 'chart.js'
import { rDistribution } from '../../utils/calculations'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip)

export default function RHistogram({ trades }) {
  const dist = rDistribution(trades)
  if (!dist.some(([, v]) => v > 0)) return <Empty />

  const data = {
    labels: dist.map(([k]) => `${k}R`),
    datasets: [{
      data: dist.map(([, v]) => v),
      backgroundColor: dist.map(([k]) => +k >= 0 ? 'rgba(44,200,74,0.7)' : 'rgba(255,77,77,0.7)'),
      borderRadius: 3,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw} עסקאות` } } },
    scales: {
      x: { ticks: { color: '#666' }, grid: { display: false } },
      y: { ticks: { color: '#666', stepSize: 1 }, grid: { color: '#1a1a1a' } },
    },
  }

  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 flex flex-col">
      <p className="text-xs uppercase tracking-widest text-[#888] mb-3">התפלגות R</p>
      <div style={{ height: 180 }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 flex items-center justify-center" style={{ height: 230 }}>
      <p className="text-[#444] text-sm">התפלגות R — אין נתונים</p>
    </div>
  )
}
