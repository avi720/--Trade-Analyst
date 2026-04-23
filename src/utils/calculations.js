export function calcStats(trades) {
  const closed = trades.filter(t => t.result && t.result !== 'Open' && t.actual_r != null)
  const wins = closed.filter(t => t.result === 'Win')
  const losses = closed.filter(t => t.result === 'Loss')

  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const avgWinR = wins.length ? wins.reduce((s, t) => s + t.actual_r, 0) / wins.length : 0
  const avgLossR = losses.length ? Math.abs(losses.reduce((s, t) => s + t.actual_r, 0) / losses.length) : 0
  const profitFactor = avgLossR ? (avgWinR * wins.length) / (avgLossR * losses.length) : null
  const totalR = closed.reduce((s, t) => s + (t.actual_r || 0), 0)

  return { total: trades.length, closed: closed.length, winRate, avgWinR, avgLossR, profitFactor, totalR }
}

export function equityCurve(trades) {
  const sorted = [...trades]
    .filter(t => t.actual_r != null && t.date)
    .sort((a, b) => parseDate(a.date) - parseDate(b.date))

  let cum = 0
  return sorted.map(t => {
    cum += t.actual_r
    return { label: t.ticker + ' ' + t.date, value: parseFloat(cum.toFixed(2)) }
  })
}

export function rDistribution(trades) {
  const bins = {}
  const step = 1
  for (let i = -4; i <= 6; i++) bins[i] = 0

  trades.filter(t => t.actual_r != null).forEach(t => {
    const bin = Math.round(t.actual_r / step) * step
    const key = Math.max(-4, Math.min(6, bin))
    bins[key] = (bins[key] || 0) + 1
  })

  return Object.entries(bins).sort((a, b) => +a[0] - +b[0])
}

export function setupPerformance(trades) {
  const map = {}
  trades.filter(t => t.setup_type && t.result && t.result !== 'Open').forEach(t => {
    if (!map[t.setup_type]) map[t.setup_type] = { wins: 0, total: 0 }
    map[t.setup_type].total++
    if (t.result === 'Win') map[t.setup_type].wins++
  })
  return Object.entries(map).map(([setup, { wins, total }]) => ({
    setup,
    winRate: parseFloat(((wins / total) * 100).toFixed(1)),
    total,
  }))
}

function parseDate(str) {
  if (!str) return 0
  const parts = str.split('/')
  if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]).getTime()
  return new Date(str).getTime()
}
