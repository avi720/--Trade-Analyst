'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface ChatContextValue {
  isOpen: boolean
  toggleChat: () => void
  contextData: Record<string, unknown>
  setContextData: (data: Record<string, unknown>) => void
}

const ChatContext = createContext<ChatContextValue>({
  isOpen: false,
  toggleChat: () => {},
  contextData: {},
  setContextData: () => {},
})

export function ChatContextProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [contextData, setContextData] = useState<Record<string, unknown>>({})

  return (
    <ChatContext.Provider value={{
      isOpen,
      toggleChat: () => setIsOpen(p => !p),
      contextData,
      setContextData,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext() {
  return useContext(ChatContext)
}
