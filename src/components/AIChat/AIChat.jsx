import { useState, useRef, useEffect } from 'react'
import ChatMessage from './ChatMessage'

export default function AIChat({ messages, onSend, loading, trades, onReview }) {
  const [input, setInput] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [messages, loading])

  function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <aside className="w-[300px] min-w-[260px] border-r border-[#222] flex flex-col bg-zinc-950/30">
      <div className="px-4 py-3 border-b border-[#222] flex items-center justify-between shrink-0">
        <span className="text-xs font-bold text-[#FFB800] uppercase tracking-widest">חנן</span>
        <button
          onClick={onReview}
          disabled={!trades.length || loading}
          className="text-[10px] border border-[#333] px-2 py-1 hover:bg-[#1a1a1a] transition-colors disabled:opacity-30"
        >
          ניתוח ביצועים
        </button>
      </div>

      <div ref={boxRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-sm text-[#888] leading-relaxed">
            <p className="text-[#FFB800] text-[10px] uppercase tracking-widest font-bold mb-2">מערכת: חנן</p>
            <p>שלום. הוסף עסקה בטאב "עסקה חדשה" ואני אנתח אותה. אפשר גם לשאול אותי שאלות כאן ישירות.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <ChatMessage key={i} sender={m.sender} text={m.text} isError={m.isError} />
        ))}
        {loading && (
          <div className="text-[#555] text-xs italic">חנן מנתח...</div>
        )}
      </div>

      <div className="p-4 border-t border-[#222] shrink-0">
        <textarea
          rows={3}
          className="w-full bg-transparent border border-[#222] p-2 text-sm focus:outline-none focus:border-[#FFB800]/50 transition-colors placeholder-zinc-700 resize-none rounded"
          placeholder="שאל את חנן..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
        />
        <div className="mt-2 flex justify-between items-center">
          <button
            onClick={send}
            disabled={loading}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            שלח
          </button>
          <span className="text-[10px] text-zinc-600">Enter לשליחה</span>
        </div>
      </div>
    </aside>
  )
}
