'use client'

import { useState, useEffect, useRef } from 'react'
import { useChatOpen, useChatContextData } from '@/lib/chat/chat-context'
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
  const { isOpen, toggleChat } = useChatOpen()
  const { contextData } = useChatContextData()

  // Escape closes the panel (non-modal — no focus trap).
  useEffect(() => {
    if (!isOpen) return
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') toggleChat()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [isOpen, toggleChat])
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

  const modelName = contextMode === 'full' ? 'Pro' : 'Flash'
  const modelEmoji = contextMode === 'full' ? '🔬' : '⚡'

  return (
    <>
      {/* Slide-in panel */}
      <aside
        role="complementary"
        aria-label="צ'אט עם חנן"
        aria-hidden={!isOpen}
        className={`
          fixed top-0 right-0 h-full w-80 bg-panel border-l border-border
          flex flex-col z-40 transition-transform duration-300
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-amber font-bold">חנן</span>
            <span className="text-text-dim text-sm font-mono">
              {modelName} <span aria-hidden="true">{modelEmoji}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewConversation}
              className="text-sm text-text-dim hover:text-text-main px-2 py-1 rounded hover:bg-input-bg transition-colors"
              title="שיחה חדשה"
            >
              חדש
            </button>
            <button
              onClick={toggleChat}
              className="w-11 h-11 flex items-center justify-center text-text-dim hover:text-text-main transition-colors text-xl leading-none rounded"
              aria-label="סגור"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>

        {/* Context mode toggle */}
        <div className="flex gap-2 px-4 py-2 border-b border-border flex-shrink-0">
          <button
            onClick={() => handleContextMode('smart')}
            aria-pressed={contextMode === 'smart'}
            className={`flex-1 py-1.5 rounded text-xs font-mono transition-colors ${
              contextMode === 'smart'
                ? 'bg-amber text-bg-dark font-bold'
                : 'bg-input-bg text-text-dim hover:text-text-main'
            }`}
          >
            חכם <span aria-hidden="true">⚡</span>
          </button>
          <button
            onClick={() => handleContextMode('full')}
            aria-pressed={contextMode === 'full'}
            className={`flex-1 py-1.5 rounded text-xs font-mono transition-colors ${
              contextMode === 'full'
                ? 'bg-amber text-bg-dark font-bold'
                : 'bg-input-bg text-text-dim hover:text-text-main'
            }`}
          >
            עומק <span aria-hidden="true">🔬</span>
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {messages.length === 0 && !isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-text-dim text-sm font-sans">שאל את חנן על הטריידים שלך</p>
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
                    ? 'bg-amber-tint border border-amber/30 text-text-main'
                    : msg.isError
                      ? 'bg-red-tint border border-red/30 text-red'
                      : 'bg-input-bg border border-shade text-text-main'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-end">
              <div className="bg-input-bg border border-shade rounded-lg px-3 py-2 text-sm text-text-dim font-mono">
                חנן חושב...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-4 py-3 border-t border-border flex-shrink-0">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              disabled={isLoading}
              placeholder="שאל את חנן..."
              className="flex-1 bg-input-bg border border-shade rounded text-text-main text-sm px-3 py-2 placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 focus:border-amber/50 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-amber text-bg-dark rounded px-3 py-2 text-sm font-mono font-bold hover:bg-amber/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
