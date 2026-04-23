import { useState } from 'react'
import { callGemini, parseAIResponse } from '../utils/gemini'

export function useAI(apiKey) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function analyze(prompt) {
    setLoading(true)
    setError(null)
    try {
      const raw = await callGemini(apiKey, prompt)
      return parseAIResponse(raw)
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { analyze, loading, error }
}
