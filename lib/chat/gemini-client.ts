import { GoogleGenAI, type FunctionDeclaration, type GenerateContentResponse } from '@google/genai'

export type ChatMessage = { role: 'user' | 'model'; parts: [{ text: string }] }

export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro'

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]

/**
 * Token accounting for one chat turn, summed across every round-trip the turn
 * needed (a tool-use turn makes several). `cachedTokens` is the one worth
 * watching: Gemini caches repeated prompt prefixes implicitly at ~90% off, and
 * P1 chose to rely on that rather than build a caching layer — so this number
 * being non-zero across a multi-turn conversation is the evidence that the
 * decision holds.
 */
export interface GeminiUsage {
  promptTokens: number
  cachedTokens: number
  responseTokens: number
  totalTokens: number
  thoughtsTokens: number
}

const ZERO_USAGE: GeminiUsage = {
  promptTokens: 0, cachedTokens: 0, responseTokens: 0, totalTokens: 0, thoughtsTokens: 0,
}

function addUsage(acc: GeminiUsage, result: GenerateContentResponse): GeminiUsage {
  const u = result.usageMetadata
  if (!u) return acc
  return {
    promptTokens: acc.promptTokens + (u.promptTokenCount ?? 0),
    cachedTokens: acc.cachedTokens + (u.cachedContentTokenCount ?? 0),
    responseTokens: acc.responseTokens + (u.candidatesTokenCount ?? 0),
    totalTokens: acc.totalTokens + (u.totalTokenCount ?? 0),
    thoughtsTokens: acc.thoughtsTokens + (u.thoughtsTokenCount ?? 0),
  }
}

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
  model: GeminiModel,
  retries = 5,
  delayFn: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
  /**
   * P1-D — enable Gemini's native Google Search grounding for this turn.
   *
   * Only ever passed for Pro users on a turn with **no custom function tools
   * registered**: Gemini 2.5 cannot serve `googleSearch` and
   * `functionDeclarations` in the same request. Note the constraint is
   * tool-call XOR web, not data XOR web — the inline trade rows and KPIs are
   * plain prompt text, so a grounded turn still answers from the user's data.
   */
  webSearch = false,
): Promise<string> {
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const chat = genAI.chats.create({
        model,
        history,
        config: {
          systemInstruction: systemPrompt,
          ...(webSearch ? { tools: [{ googleSearch: {} }] } : {}),
        },
      })
      const result = await chat.sendMessage({ message: newMessage })
      return result.text ?? ''
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

/**
 * How many model→tool→model rounds one turn may take before we stop and ask
 * for an answer from what has already been gathered.
 *
 * Six is enough for the realistic worst case the spec calls out — "compare my
 * most recent trades against my oldest" is two `queryTrades` calls plus an
 * aggregation or two. A model that has not converged after six rounds is
 * looping, not working, and each round is a full billed request.
 */
export const MAX_TOOL_ITERATIONS = 6

const OUT_OF_ROUNDS_NUDGE =
  'הגעת למספר המרבי של קריאות כלים לתור הזה. ענה עכשיו על סמך מה שכבר אספת, ' +
  'וציין במפורש בתשובה על איזה היקף נתונים התבססת ומה לא הספקת לבדוק.'

export interface ChatToolRuntime {
  declarations: FunctionDeclaration[]
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface ToolLoopResult {
  text: string
  /** Every tool the model actually invoked, in order — for logging and tests. */
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>
  usage: GeminiUsage
  /** True when the loop hit `MAX_TOOL_ITERATIONS` and had to force an answer. */
  exhausted: boolean
}

/**
 * Runs one chat turn with function-tools registered, driving the
 * model → functionCall → functionResponse → model loop to a text answer.
 *
 * Used only above the inline byte budget (see `context-builder.ts`); below it
 * the rows are already in the prompt and `callGemini` answers in one hop.
 *
 * Note for P1-D: Gemini 2.5 cannot combine native Search grounding with custom
 * function declarations in the same request. Any turn that reaches this
 * function is therefore a tool-call turn with web grounding off.
 */
export async function callGeminiWithTools(
  history: ChatMessage[],
  newMessage: string,
  systemPrompt: string,
  model: GeminiModel,
  tools: ChatToolRuntime,
  opts: {
    maxIterations?: number
    retries?: number
    delayFn?: (ms: number) => Promise<void>
  } = {},
): Promise<ToolLoopResult> {
  const maxIterations = opts.maxIterations ?? MAX_TOOL_ITERATIONS
  const retries = opts.retries ?? 5
  const delayFn = opts.delayFn ?? (ms => new Promise(r => setTimeout(r, ms)))

  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  const chat = genAI.chats.create({
    model,
    history,
    config: {
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: tools.declarations }],
    },
  })

  async function send(message: unknown): Promise<GenerateContentResponse> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await chat.sendMessage({ message: message as any })
      } catch (error) {
        console.error(`[gemini:tools] attempt ${attempt + 1} failed:`, error)
        if (attempt === retries || !isRetryable(error)) {
          throw new Error('חנן אינו זמין כרגע. אנא נסה שוב מאוחר יותר.')
        }
        await delayFn(RETRY_DELAYS[attempt])
      }
    }
    throw new Error('חנן אינו זמין כרגע. אנא נסה שוב מאוחר יותר.')
  }

  const toolCalls: ToolLoopResult['toolCalls'] = []
  let usage = ZERO_USAGE
  let message: unknown = newMessage
  let pendingResponses: unknown[] = []

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const result = await send(message)
    usage = addUsage(usage, result)

    const calls = result.functionCalls ?? []
    if (calls.length === 0) {
      return { text: result.text ?? '', toolCalls, usage, exhausted: false }
    }

    pendingResponses = []
    for (const call of calls) {
      const name = call.name ?? ''
      const args = (call.args ?? {}) as Record<string, unknown>
      toolCalls.push({ name, args })

      let response: unknown
      try {
        response = await tools.execute(name, args)
      } catch (error) {
        // A failed tool is data the model can route around — surfacing it as a
        // function response beats 500ing the whole turn over one bad argument.
        console.error(`[gemini:tools] executor "${name}" threw:`, error)
        response = { error: error instanceof Error ? error.message : 'tool execution failed' }
      }
      pendingResponses.push({ functionResponse: { name, response: { result: response } } })
    }
    message = pendingResponses
  }

  // Out of rounds with tool responses still unsent. Deliver them alongside the
  // nudge so the final answer is built from everything that was gathered.
  const final = await send([...pendingResponses, { text: OUT_OF_ROUNDS_NUDGE }])
  usage = addUsage(usage, final)
  return {
    text: final.text ?? 'לא הצלחתי להשלים את הניתוח בתוך מספר הצעדים המותר. נסה לצמצם את השאלה.',
    toolCalls,
    usage,
    exhausted: true,
  }
}
