import { useState, useCallback } from 'react'
import Header from './components/Header'
import Dashboard from './components/Dashboard/Dashboard'
import TradesLog from './components/TradesLog/TradesLog'
import AddTrade from './components/AddTrade/AddTrade'
import AIChat from './components/AIChat/AIChat'
import { useTrades } from './hooks/useTrades'
import { useAI } from './hooks/useAI'
import { callGemini, parseAIResponse } from './utils/gemini'

const API_KEY_STORAGE = 'ta_gemini_key'

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [messages, setMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '')

  const { trades, addTrade, deleteTrade, clearAll } = useTrades()
  const aiHook = useAI(apiKey)

  function handleApiKeyChange(key) {
    setApiKey(key)
    localStorage.setItem(API_KEY_STORAGE, key)
  }

  function addMessage(sender, text, isError = false) {
    setMessages(prev => [...prev, { sender, text, isError }])
  }

  function handleTradeAdded(tradeData, aiText) {
    addTrade(tradeData)
    if (aiText) addMessage('חנן', aiText)
    else addMessage('מערכת', 'עסקה נשמרה ללא ניתוח AI.', true)
    setActiveTab('log')
  }

  async function handleChatSend(text) {
    addMessage('משתמש', text)
    setChatLoading(true)
    try {
      const raw = await callGemini(apiKey, text)
      const { text: aiText } = parseAIResponse(raw)
      addMessage('חנן', aiText)
    } catch (e) {
      addMessage('מערכת', `שגיאה: ${e.message}`, true)
    } finally {
      setChatLoading(false)
    }
  }

  async function handleReview() {
    if (!trades.length) return
    addMessage('משתמש', '[בקשת ניתוח ביצועים]')
    setChatLoading(true)
    try {
      const context = `נתח את העסקאות הבאות:\n${JSON.stringify(trades)}`
      const raw = await callGemini(apiKey, context)
      const { text } = parseAIResponse(raw)
      addMessage('חנן', text)
    } catch (e) {
      addMessage('מערכת', `שגיאת ניתוח: ${e.message}`, true)
    } finally {
      setChatLoading(false)
    }
  }

  function handleClear() {
    if (confirm('למחוק לצמיתות את כל העסקאות? (בלתי הפיך)')) {
      clearAll()
      setMessages([])
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        trades={trades}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClear={handleClear}
        apiKey={apiKey}
        onApiKeyChange={handleApiKeyChange}
      />
      <div className="flex flex-1 overflow-hidden">
        <AIChat
          messages={messages}
          onSend={handleChatSend}
          loading={chatLoading}
          trades={trades}
          onReview={handleReview}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'dashboard' && <Dashboard trades={trades} />}
          {activeTab === 'log' && <TradesLog trades={trades} onDelete={deleteTrade} />}
          {activeTab === 'add' && <AddTrade onTradeAdded={handleTradeAdded} aiHook={aiHook} />}
        </main>
      </div>
    </div>
  )
}
