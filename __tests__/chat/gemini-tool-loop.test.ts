import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendMessage = vi.fn()
const mockCreate = vi.fn(() => ({ sendMessage: mockSendMessage }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({ chats: { create: mockCreate } })),
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER', INTEGER: 'INTEGER' },
}))

const { Type } = await import('@google/genai')
const { callGeminiWithTools, MAX_TOOL_ITERATIONS } = await import('@/lib/chat/gemini-client')
type ToolExecute = import('@/lib/chat/gemini-client').ChatToolRuntime['execute']

const noDelay = async () => {}
const model = 'gemini-2.5-pro' as const

const declarations = [
  { name: 'queryTrades', description: 'q', parameters: { type: Type.OBJECT, properties: {} } },
]

function textReply(text: string, usage?: Record<string, number>) {
  return { text, functionCalls: [], usageMetadata: usage }
}
function callReply(name: string, args: Record<string, unknown>, usage?: Record<string, number>) {
  return { text: '', functionCalls: [{ name, args }], usageMetadata: usage }
}

function run(
  execute: ToolExecute = async () => ({ rows: [] }),
  opts: { maxIterations?: number; retries?: number } = {},
) {
  return callGeminiWithTools([], 'שאלה', 'אתה חנן', model, { declarations, execute }, {
    delayFn: noDelay, retries: 0, ...opts,
  })
}

describe('callGeminiWithTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GEMINI_API_KEY = 'test-key'
  })

  it('registers the declarations as tools on the chat', async () => {
    mockSendMessage.mockResolvedValueOnce(textReply('שלום'))
    await run()
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ tools: [{ functionDeclarations: declarations }] }),
      }),
    )
  })

  it('returns immediately when the model answers without calling a tool', async () => {
    mockSendMessage.mockResolvedValueOnce(textReply('תשובה ישירה'))
    const execute = vi.fn()
    const result = await run(execute)
    expect(result.text).toBe('תשובה ישירה')
    expect(result.toolCalls).toEqual([])
    expect(result.exhausted).toBe(false)
    expect(execute).not.toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('executes a tool call and feeds the result back as a functionResponse', async () => {
    mockSendMessage
      .mockResolvedValueOnce(callReply('queryTrades', { limit: 20 }))
      .mockResolvedValueOnce(textReply('ניתחתי 20 טריידים'))
    const execute = vi.fn(async () => ({ rows: [{ ticker: 'AAPL' }], matched: 1 }))

    const result = await run(execute)

    expect(execute).toHaveBeenCalledWith('queryTrades', { limit: 20 })
    expect(result.text).toBe('ניתחתי 20 טריידים')
    expect(result.toolCalls).toEqual([{ name: 'queryTrades', args: { limit: 20 } }])

    const secondCall = mockSendMessage.mock.calls[1][0].message
    expect(secondCall).toEqual([
      {
        functionResponse: {
          name: 'queryTrades',
          response: { result: { rows: [{ ticker: 'AAPL' }], matched: 1 } },
        },
      },
    ])
  })

  it('drives a multi-call sequence — the "recent vs oldest" shape from the spec', async () => {
    mockSendMessage
      .mockResolvedValueOnce(callReply('queryTrades', { direction: 'desc', limit: 20 }))
      .mockResolvedValueOnce(callReply('queryTrades', { direction: 'asc', limit: 20 }))
      .mockResolvedValueOnce(textReply('השוויתי 20 אחרונים מול 20 ראשונים מתוך 340'))

    const execute = vi.fn(async () => ({ rows: [], matched: 340 }))
    const result = await run(execute)

    expect(execute).toHaveBeenCalledTimes(2)
    expect(result.toolCalls.map(c => c.args.direction)).toEqual(['desc', 'asc'])
    expect(result.exhausted).toBe(false)
  })

  it('handles several tool calls returned in one model turn', async () => {
    mockSendMessage
      .mockResolvedValueOnce({
        text: '',
        functionCalls: [
          { name: 'getSetupBreakdown', args: {} },
          { name: 'getTickerBreakdown', args: { limit: 5 } },
        ],
      })
      .mockResolvedValueOnce(textReply('סיכום'))

    const execute = vi.fn(async (name: string) => ({ tool: name }))
    const result = await run(execute)

    expect(execute).toHaveBeenCalledTimes(2)
    expect(result.toolCalls.map(c => c.name)).toEqual(['getSetupBreakdown', 'getTickerBreakdown'])
    expect(mockSendMessage.mock.calls[1][0].message).toHaveLength(2)
  })

  it('hands an executor throw back to the model instead of failing the turn', async () => {
    mockSendMessage
      .mockResolvedValueOnce(callReply('queryTrades', { limit: 9999 }))
      .mockResolvedValueOnce(textReply('התאוששתי'))

    const execute = vi.fn(async () => { throw new Error('bad argument') })
    const result = await run(execute)

    expect(result.text).toBe('התאוששתי')
    const sent = mockSendMessage.mock.calls[1][0].message as Array<{
      functionResponse: { response: { result: { error: string } } }
    }>
    expect(sent[0].functionResponse.response.result.error).toBe('bad argument')
  })

  it('stops after the iteration cap and forces a final answer', async () => {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      mockSendMessage.mockResolvedValueOnce(callReply('queryTrades', { offset: i }))
    }
    mockSendMessage.mockResolvedValueOnce(textReply('הנה מה שהספקתי'))

    const result = await run()

    expect(result.exhausted).toBe(true)
    expect(result.toolCalls).toHaveLength(MAX_TOOL_ITERATIONS)
    expect(result.text).toBe('הנה מה שהספקתי')
    expect(mockSendMessage).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS + 1)
  })

  it('sends the last pending tool results alongside the out-of-rounds nudge', async () => {
    for (let i = 0; i < 2; i++) {
      mockSendMessage.mockResolvedValueOnce(callReply('queryTrades', { offset: i }))
    }
    mockSendMessage.mockResolvedValueOnce(textReply('סיכום חלקי'))

    await run(vi.fn(async () => ({ rows: ['x'] })), { maxIterations: 2 })

    const finalMessage = mockSendMessage.mock.calls[2][0].message as Array<Record<string, unknown>>
    expect(finalMessage[0]).toHaveProperty('functionResponse')
    expect(finalMessage[1]).toHaveProperty('text')
    expect(String((finalMessage[1] as { text: string }).text)).toContain('ציין במפורש')
  })

  it('respects a custom maxIterations', async () => {
    mockSendMessage
      .mockResolvedValueOnce(callReply('queryTrades', {}))
      .mockResolvedValueOnce(textReply('נאלצתי לעצור'))

    const result = await run(vi.fn(async () => ({})), { maxIterations: 1 })

    expect(result.exhausted).toBe(true)
    expect(result.toolCalls).toHaveLength(1)
  })

  it('sums usage across every round-trip in the turn', async () => {
    mockSendMessage
      .mockResolvedValueOnce(callReply('queryTrades', {}, {
        promptTokenCount: 1000, cachedContentTokenCount: 800,
        candidatesTokenCount: 50, totalTokenCount: 1050,
      }))
      .mockResolvedValueOnce(textReply('סיום', {
        promptTokenCount: 1200, cachedContentTokenCount: 900,
        candidatesTokenCount: 120, totalTokenCount: 1320,
      }))

    const result = await run()

    expect(result.usage).toEqual({
      promptTokens: 2200,
      cachedTokens: 1700,
      responseTokens: 170,
      totalTokens: 2370,
      thoughtsTokens: 0,
    })
  })

  it('tolerates a response with no usageMetadata', async () => {
    mockSendMessage.mockResolvedValueOnce(textReply('שלום'))
    const result = await run()
    expect(result.usage.totalTokens).toBe(0)
  })

  it('retries a 429 inside the loop and still completes', async () => {
    const err = Object.assign(new Error('429 Too Many Requests'), { status: 429 })
    mockSendMessage
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(textReply('אחרי ניסיון חוזר'))

    const result = await callGeminiWithTools(
      [], 'שאלה', 'אתה חנן', model,
      { declarations, execute: vi.fn() },
      { delayFn: noDelay, retries: 1 },
    )
    expect(result.text).toBe('אחרי ניסיון חוזר')
  })

  it('throws the Hebrew user-facing error when retries are exhausted', async () => {
    mockSendMessage.mockRejectedValue(Object.assign(new Error('500'), { status: 500 }))
    await expect(run()).rejects.toThrow('חנן אינו זמין כרגע')
  })
})
