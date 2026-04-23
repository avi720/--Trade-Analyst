'use client'

// Phase 1: placeholder — will be wired up in Phase 3 (IBKR) and Phase 4 (Polygon)
export function SyncIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-[#888888] font-mono">
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#888888]" />
        IBKR
      </span>
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#888888]" />
        מחירים
      </span>
    </div>
  )
}
