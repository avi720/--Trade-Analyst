import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendMessage = vi.fn()
const mockStartChat = vi.fn(() => ({ sendMessage: mockSendMessage }))
const mockGetGenerativeModel = vi.fn(() => ({ startChat: mockStartChat }))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel: mockGetGenerativeModel })),
}))

// Import after mock setup
const { callGemini } = await import('@/lib/chat/gemini-client')

const noDelay = async () => {}
const systemPrompt = 'אתה חנן'
const model = 'gemini-2.0-flash' as const

describe('callGemini', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GEMINI_API_KEY = 'test-key'
  })

  it('returns response text on success', async () => {
    mockSendMessage.mockResolvedValueOnce({ response: { text: () => 'שלום' } })
    const result = await callGemini([], 'שאלה', systemPrompt, model, 5, noDelay)
    expect(result).toBe('שלום')
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    const err = Object.assign(new Error('429 Too Many Requests'), { status: 429 })
    mockSendMessage
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ response: { text: () => 'תשובה' } })
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

  it('passes correct model name to getGenerativeModel', async () => {
    mockSendMessage.mockResolvedValueOnce({ response: { text: () => 'ok' } })
    await callGemini([], 'שאלה', systemPrompt, 'gemini-2.0-pro', 5, noDelay)
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.0-pro' })
    )
  })

  it('retries on 5xx server error', async () => {
    const err = Object.assign(new Error('500 Internal Server Error'), { status: 500 })
    mockSendMessage
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ response: { text: () => 'בסדר' } })
    const result = await callGemini([], 'שאלה', systemPrompt, model, 1, noDelay)
    expect(result).toBe('בסדר')
  })

  it('passes history to startChat', async () => {
    mockSendMessage.mockResolvedValueOnce({ response: { text: () => 'ok' } })
    const history = [{ role: 'user' as const, parts: [{ text: 'שאלה קודמת' }] }]
    await callGemini(history, 'שאלה חדשה', systemPrompt, model, 5, noDelay)
    expect(mockStartChat).toHaveBeenCalledWith({ history })
  })
})
