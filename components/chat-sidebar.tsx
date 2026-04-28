'use client'

import { useState, useEffect, useRef } from 'react'
import { useChatContext } from '@/lib/chat/chat-context'
import { createClient } from '@/lib/supabase/client'

type ContextMode = 'smart' | 'full'

type UIMessage = {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

const LS_CONV_ID = 'chat_conversation_id'
const LS_CTX_MODE = 'chat_context_mode'

function ls(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch {}
}
function lsRemove(key: string) {
  try { localStorage.removeItem(key) } catch {}
}

export function ChatSidebar() {
  const { isOpen, toggleChat, contextData } = useChatContext()
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [contextMode, setContextMode] = useState<ContextMode>('smart')
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load conversation from localStorage + DB on mount
  useEffect(() => {
    const savedMode = ls(LS_CTX_MODE)
    if (savedMode === 'smart' || savedMode === 'full') setContextMode(savedMode)

    const savedId = ls(LS_CONV_ID)
    if (!savedId) return
    setConversationId(savedId)

    const supabase = createClient()
    supabase
      .from('AIConversation')
      .select('messages')
      .eq('id', savedId)
      .single()
      .then(({ data }) => {
        const row = data as { messages: unknown } | null
        if (row?.messages) {
          const stored = row.messages as StoredMessage[]
          setMessages(stored.map(m => ({ role: m.role, content: m.content })))
        }
      })
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  function handleContextMode(mode: ContextMode) {
    setContextMode(mode)
    lsSet(LS_CTX_MODE, mode)
  }

  function handleNewConversation() {
    lsRemove(LS_CONV_ID)
    setConversationId(null)
    setMessages([])
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: conversationId ?? undefined,
          contextMode,
          contextData: contextMode === 'smart' ? contextData : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        const errMsg = data.error ?? 'שגיאה לא ידועה. נסה שוב.'
        setMessages(prev => [...prev, { role: 'assistant', content: errMsg, isError: true }])
        return
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId)
        lsSet(LS_CONV_ID, data.conversationId)
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'שגיאת רשת. בדוק את החיבור ונסה שוב.',
        isError: true,
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const modelLabel = contextMode === 'full' ? 'Pro 🔬' : 'Flash ⚡'

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
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#222222] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[#FFB800] font-bold">חנן</span>
            <span className="text-[#888888] text-xs font-mono">{modelLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewConversation}
              className="text-xs text-[#888888] hover:text-[#E0E0E0] px-2 py-1 rounded hover:bg-[#1A1A1A] transition-colors"
              title="שיחה חדשה"
            >
              חדש
            </button>
            <button
              onClick={toggleChat}
              className="text-[#888888] hover:text-[#E0E0E0] transition-colors text-lg leading-none"
              aria-label="סגור"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Context mode toggle */}
        <div className="flex gap-2 px-4 py-2 border-b border-[#222222] flex-shrink-0">
          <button
            onClick={() => handleContextMode('smart')}
            className={`flex-1 py-1.5 rounded text-xs font-mono transition-colors ${
              contextMode === 'smart'
                ? 'bg-[#FFB800] text-[#080808] font-bold'
                : 'bg-[#1A1A1A] text-[#888888] hover:text-[#E0E0E0]'
            }`}
          >
            חכם ⚡
          </button>
          <button
            onClick={() => handleContextMode('full')}
            className={`flex-1 py-1.5 rounded text-xs font-mono transition-colors ${
              contextMode === 'full'
                ? 'bg-[#FFB800] text-[#080808] font-bold'
                : 'bg-[#1A1A1A] text-[#888888] hover:text-[#E0E0E0]'
            }`}
          >
            עומק 🔬
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {messages.length === 0 && !isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-[#888888] text-sm font-sans">שאל את חנן על הטריידים שלך</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm font-sans whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-[#1A1200] border border-[#FFB800]/30 text-[#E0E0E0]'
                    : msg.isError
                      ? 'bg-[#2A0A0A] border border-[#FF4D4D]/30 text-[#FF4D4D]'
                      : 'bg-[#1A1A1A] border border-[#333333] text-[#E0E0E0]'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-end">
              <div className="bg-[#1A1A1A] border border-[#333333] rounded-lg px-3 py-2 text-sm text-[#888888] font-mono">
                חנן חושב...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-4 py-3 border-t border-[#222222] flex-shrink-0">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              disabled={isLoading}
              placeholder="שאל את חנן..."
              className="flex-1 bg-[#1A1A1A] border border-[#333333] rounded text-[#E0E0E0] text-sm px-3 py-2 placeholder-[#555555] focus:outline-none focus:border-[#FFB800]/50 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-[#FFB800] text-[#080808] rounded px-3 py-2 text-sm font-mono font-bold hover:bg-[#FFB800]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
          onClick={toggleChat}
        />
      )}
    </>
  )
}
