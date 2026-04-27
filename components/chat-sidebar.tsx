'use client'

interface ChatSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function ChatSidebar({ isOpen, onClose }: ChatSidebarProps) {
  return (
    <>
      {/* Slide-in panel */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-80 bg-[#111111] border-r border-[#222222]
          flex flex-col z-40 transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#222222]">
          <span className="font-mono text-[#FFB800] font-bold">חנן</span>
          <button
            onClick={onClose}
            className="text-[#888888] hover:text-[#E0E0E0] transition-colors text-lg leading-none"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        {/* Body — Phase 7 stub */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-3xl">🤖</div>
          <p className="text-[#E0E0E0] font-sans text-sm">חנן יהיה זמין ב-Phase 7</p>
          <p className="text-[#888888] font-sans text-xs">האסיסטנט ה-AI שלך לניתוח מסחר</p>
        </div>

        {/* Disabled input area */}
        <div className="px-4 py-3 border-t border-[#222222]">
          <div className="flex gap-2">
            <input
              disabled
              placeholder="שאל את חנן..."
              className="flex-1 bg-[#1A1A1A] border border-[#333333] rounded text-[#555555] text-sm px-3 py-2 cursor-not-allowed"
            />
            <button
              disabled
              className="bg-[#222222] text-[#555555] rounded px-3 py-2 text-sm cursor-not-allowed"
            >
              שלח
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={onClose}
        />
      )}
    </>
  )
}
