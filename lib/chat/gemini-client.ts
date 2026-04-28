import { GoogleGenerativeAI } from '@google/generative-ai'

export type ChatMessage = { role: 'user' | 'model'; parts: [{ text: string }] }

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]

function isRetryable(error: unknown): boolean {
  const anyErr = error as Record<string, unknown>
  if (typeof anyErr.status === 'number') {
    const s = anyErr.status
    return s === 429 || (s >= 500 && s < 600)
  }
  if (error instanceof Error) {
    const msg = error.message
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('quota') ||
      /5\d\d/.test(msg) || error.name === 'FetchError'
  }
  return false
}

export async function callGemini(
  history: ChatMessage[],
  newMessage: string,
  systemPrompt: string,
  model: 'gemini-2.0-flash' | 'gemini-2.0-pro',
  retries = 5,
  delayFn: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt })

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const chat = genModel.startChat({ history })
      const result = await chat.sendMessage(newMessage)
      return result.response.text()
    } catch (error) {
      console.error(`[gemini] attempt ${attempt + 1} failed:`, error)
      if (attempt === retries || !isRetryable(error)) {
        throw new Error('חנן אינו זמין כרגע. אנא נסה שוב מאוחר יותר.')
      }
      await delayFn(RETRY_DELAYS[attempt])
    }
  }
  throw new Error('חנן אינו זמין כרגע. אנא נסה שוב מאוחר יותר.')
}
