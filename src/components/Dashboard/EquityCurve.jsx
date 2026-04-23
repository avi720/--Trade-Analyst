import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale,
  CategoryScale, Tooltip, Filler,
} from 'chart.js'
import { equityCurve } from '../../utils/calculations'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

export default function EquityCurve({ trades }) {
  const points = equityCurve(trades)

  const data = {
    labels: points.map(p => p.label),
    datasets: [{
      data: points.map(p => p.value),
      borderColor: '#FFB800',
      backgroundColor: 'rgba(255,184,0,0.08)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
      pointBackgroundColor: '#FFB800',
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw}R` } } },
    scales: {
      x: { display: false },
      y: {
        ticks: { color: '#666', callback: v => `${v}R` },
        grid: { color: '#1a1a1a' },
      },
    },
  }

  if (!points.length) return <Empty label="עקומת הון" />

  return (
    <ChartWrapper title="עקומת הון (R מצטבר)">
      <Line data={data} options={options} />
    </ChartWrapper>
  )
}

function ChartWrapper({ title, children }) {
  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 flex flex-col">
      <p className="text-xs uppercase tracking-widest text-[#888] mb-3">{title}</p>
      <div className="flex-1" style={{ height: 180 }}>{children}</div>
    </div>
  )
}

function Empty({ label }) {
  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 flex items-center justify-center" style={{ height: 230 }}>
      <p className="text-[#444] text-sm">{label} — אין נתונים</p>
    </div>
  )
}
