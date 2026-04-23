import { exportCSV, exportExcel } from '../../utils/export'

export default function ExportButtons({ trades }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => exportCSV(trades)}
        className="text-xs border border-[#333] px-3 py-1.5 hover:bg-[#1a1a1a] transition-colors rounded"
      >
        ייצוא CSV
      </button>
      <button
        onClick={() => exportExcel(trades)}
        className="text-xs border border-[#2CC84A]/30 text-[#2CC84A] px-3 py-1.5 hover:bg-[#2CC84A]/10 transition-colors rounded"
      >
        ייצוא Excel
      </button>
    </div>
  )
}
