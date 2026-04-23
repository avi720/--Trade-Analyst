import * as XLSX from 'xlsx'

const HEADERS = {
  date: 'תאריך', ticker: 'סימול', direction: 'כיוון', setup_type: 'סטאפ',
  entry_price: 'כניסה', stop_price: 'סטופ', target_price: 'יעד',
  r_multiple_entry: 'R מתוכנן', exit_price: 'יציאה', result: 'תוצאה',
  actual_r: 'R בפועל', execution_quality: 'ביצוע', emotional_state: 'רגש',
  did_right: 'עשה נכון', would_change: 'ישנה',
}

function toRows(trades) {
  return trades.map(t =>
    Object.fromEntries(Object.entries(HEADERS).map(([k, label]) => [label, t[k] ?? '']))
  )
}

export function exportCSV(trades) {
  const rows = toRows(trades)
  const keys = Object.values(HEADERS)
  const lines = [keys.join(','), ...rows.map(r => keys.map(k => `"${r[k]}"`).join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportExcel(trades) {
  const ws = XLSX.utils.json_to_sheet(toRows(trades))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trades')
  XLSX.writeFile(wb, `trades_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
