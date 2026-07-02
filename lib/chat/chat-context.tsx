'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// Two contexts so consumers can subscribe to only what they read.
// P6: previously a single unified value re-rendered every consumer on any
// state change. Splitting isOpen/toggleChat from contextData/setContextData
// means reading isOpen alone does not re-render when contextData changes.

interface ChatOpenValue {
  isOpen: boolean
  toggleChat: () => void
}

interface ChatContextDataValue {
  contextData: Record<string, unknown>
  setContextData: (data: Record<string, unknown>) => void
}

const ChatOpenContext = createContext<ChatOpenValue>({
  isOpen: false,
  toggleChat: () => {},
})

const ChatContextDataContext = createContext<ChatContextDataValue>({
  contextData: {},
  setContextData: () => {},
})

export function ChatContextProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [contextData, setContextData] = useState<Record<string, unknown>>({})

  const toggleChat = useCallback(() => setIsOpen(p => !p), [])

  const openValue = useMemo<ChatOpenValue>(
    () => ({ isOpen, toggleChat }),
    [isOpen, toggleChat],
  )

  // setContextData from useState is already referentially stable, but we
  // include it in the memo tuple for correctness.
  const dataValue = useMemo<ChatContextDataValue>(
    () => ({ contextData, setContextData }),
    [contextData, setContextData],
  )

  return (
    <ChatOpenContext.Provider value={openValue}>
      <ChatContextDataContext.Provider value={dataValue}>
        {children}
      </ChatContextDataContext.Provider>
    </ChatOpenContext.Provider>
  )
}

export function useChatOpen() {
  return useContext(ChatOpenContext)
}

export function useChatContextData() {
  return useContext(ChatContextDataContext)
}

// Backwards-compat shim: research-dashboard.tsx is a Phase 1 file we must not
// touch (per the P6 work brief). It reads only `setContextData`, which lives
// in ChatContextDataContext — so the shim resolves against that context and
// does not subscribe to isOpen/toggleChat changes.
// New consumers should prefer `useChatOpen()` / `useChatContextData()`.
export function useChatContext() {
  return useContext(ChatContextDataContext)
}
