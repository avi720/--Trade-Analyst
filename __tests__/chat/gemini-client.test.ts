import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatMessage } from '@/lib/chat/gemini-client'

const mockSendMessage = vi.fn()
const mockCreate = vi.fn(() => ({ sendMessage: mockSendMessage }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({ chats: { create: mockCreate } })),
}))

// Import after mock setup
const { callGemini } = await import('@/lib/chat/gemini-client')

const noDelay = async () => {}
const systemPrompt = 'אתה חנן'
const model = 'gemini-2.5-flash' as const

describe('callGemini', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GEMINI_API_KEY = 'test-key'
  })

  it('returns response text on success', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: 'שלום' })
    const result = await callGemini([], 'שאלה', systemPrompt, model, 5, noDelay)
    expect(result).toBe('שלום')
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    const err = Object.assign(new Error('429 Too Many Requests'), { status: 429 })
    mockSendMessage
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ text: 'תשובה' })
    const result = await callGemini([], 'שאלה', systemPrompt, model, 1, noDelay)
    expect(result).toBe('תשובה')
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
  })

  it('throws after exhausting all retries', async () => {
    const err = Object.assign(new Error('429'), { status: 429 })
    mockSendMessage.mockRejectedValue(err)
    await expect(callGemini([], 'שאלה', systemPrompt, model, 2, noDelay))
      .rejects.toThrow('חנן אינו זמין')
    expect(mockSendMessage).toHaveBeenCalledTimes(3)
  })

  it('does not retry on non-retryable 400 error', async () => {
    const err = Object.assign(new Error('400 Bad Request'), { status: 400 })
    mockSendMessage.mockRejectedValueOnce(err)
    await expect(callGemini([], 'שאלה', systemPrompt, model, 5, noDelay))
      .rejects.toThrow()
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('passes correct model name to chats.create', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: 'ok' })
    await callGemini([], 'שאלה', systemPrompt, 'gemini-2.5-pro', 5, noDelay)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.5-pro' })
    )
  })

  it('retries on 5xx server error', async () => {
    const err = Object.assign(new Error('500 Internal Server Error'), { status: 500 })
    mockSendMessage
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ text: 'בסדר' })
    const result = await callGemini([], 'שאלה', systemPrompt, model, 1, noDelay)
    expect(result).toBe('בסדר')
  })

  it('passes history and systemInstruction to chats.create', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: 'ok' })
    const history: ChatMessage[] = [{ role: 'user', parts: [{ text: 'שאלה קודמת' }] }]
    await callGemini(history, 'שאלה חדשה', systemPrompt, model, 5, noDelay)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ history, config: { systemInstruction: systemPrompt } })
    )
    expect(mockSendMessage).toHaveBeenCalledWith({ message: 'שאלה חדשה' })
  })

  // P1-D — grounding is opt-in per turn because Gemini 2.5 rejects a request
  // carrying both googleSearch and custom functionDeclarations.
  it('registers no tools when webSearch is off', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: 'ok' })
    await callGemini([], 'שאלה', systemPrompt, model, 5, noDelay, false)
    // An exact config match — any `tools` key would fail this.
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ config: { systemInstruction: systemPrompt } }),
    )
  })

  it('defaults webSearch to off when the argument is omitted', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: 'ok' })
    await callGemini([], 'שאלה', systemPrompt, model, 5, noDelay)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ config: { systemInstruction: systemPrompt } }),
    )
  })

  it('registers googleSearch grounding when webSearch is on', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: 'ok' })
    await callGemini([], 'שאלה', systemPrompt, model, 5, noDelay, true)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ tools: [{ googleSearch: {} }] }),
      }),
    )
  })
})
