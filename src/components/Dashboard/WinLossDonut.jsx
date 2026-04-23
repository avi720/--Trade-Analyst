import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

export default function WinLossDonut({ trades }) {
  const counts = { Win: 0, Loss: 0, Breakeven: 0, Open: 0 }
  trades.forEach(t => { if (t.result) counts[t.result] = (counts[t.result] || 0) + 1 })

  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  if (!total) return <Empty />

  const data = {
    labels: ['רווח', 'הפסד', 'מאוזן', 'פתוח'],
    datasets: [{
      data: [counts.Win, counts.Loss, counts.Breakeven, counts.Open],
      backgroundColor: ['#2CC84A', '#FF4D4D', '#888', '#333'],
      borderWidth: 0,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { position: 'bottom', labels: { color: '#888', boxWidth: 12, padding: 12 } },
      tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` } },
    },
  }

  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 flex flex-col">
      <p className="text-xs uppercase tracking-widest text-[#888] mb-3">התפלגות תוצאות</p>
      <div className="flex-1 flex items-center justify-center" style={{ height: 180 }}>
        <Doughnut data={data} options={options} />
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 flex items-center justify-center" style={{ height: 230 }}>
      <p className="text-[#444] text-sm">התפלגות — אין נתונים</p>
    </div>
  )
}
