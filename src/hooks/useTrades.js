import { useState, useCallback } from 'react'

const KEY = 'ta_trades_v2'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function useTrades() {
  const [trades, setTrades] = useState(load)

  const save = useCallback(updated => {
    setTrades(updated)
    localStorage.setItem(KEY, JSON.stringify(updated))
  }, [])

  const addTrade = useCallback(data => {
    const trade = {
      id: generateId(),
      date: data.date || new Date().toLocaleDateString('he-IL'),
      ...data,
    }
    save(prev => {
      const next = [...prev, trade]
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
    return trade
  }, [save])

  const updateTrade = useCallback((id, patch) => {
    save(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...patch } : t)
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [save])

  const deleteTrade = useCallback(id => {
    save(prev => {
      const next = prev.filter(t => t.id !== id)
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [save])

  const clearAll = useCallback(() => {
    localStorage.removeItem(KEY)
    setTrades([])
  }, [])

  return { trades, addTrade, updateTrade, deleteTrade, clearAll }
}
