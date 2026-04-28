import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, type ChatMessage } from '@/lib/chat/gemini-client'
import type { Json } from '@/lib/db/types'

type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

const SYSTEM_PROMPT = `אתה חנן — מנטור מסחר מנוסה ואנליטיקאי טכני. אתה עוזר לאנליסט מסחר לנתח את הטריידים שלו.
אתה מומחה ב-R-multiples, FIFO accounting, ניהול סיכונים, ופסיכולוגיית מסחר.
דבר בעברית, בצורה קצרה, ישירה ומבוססת נתונים. הימנע מעצות גנריות — התמקד בדפוסים שאתה רואה בנתונים.
כשאין מספיק מידע, שאל שאלה ממוקדת אחת.

הנתונים הנוכחיים:
{CONTEXT}`

function buildSystemPrompt(context: string): string {
  return SYSTEM_PROMPT.replace('{CONTEXT}', context)
}

function toGeminiHistory(stored: StoredMessage[]): ChatMessage[] {
  return stored.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    message: string
    conversationId?: string
    contextMode: 'smart' | 'full'
    contextData?: Record<string, unknown>
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { message, conversationId, contextMode, contextData } = body

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  // Build context string
  let contextString: string
  if (contextMode === 'full') {
    const { data: trades } = await supabase
      .from('Trade')
      .select('ticker, direction, setupType, openedAt, closedAt, actualR, realizedPnl, result, avgEntryPrice, avgExitPrice, stopPrice, totalQuantityOpened, executionQuality')
      .eq('userId', user.id)
      .eq('status', 'Closed')
    contextString = JSON.stringify(trades ?? [])
  } else {
    contextString = JSON.stringify(contextData ?? {})
  }

  const systemPrompt = buildSystemPrompt(contextString)
  const model = contextMode === 'full' ? 'gemini-2.0-pro' : 'gemini-2.0-flash'

  // Load or create conversation
  const convId = conversationId ?? crypto.randomUUID()
  let storedMessages: StoredMessage[] = []

  if (conversationId) {
    const { data: conv } = await supabase
      .from('AIConversation')
      .select('messages')
      .eq('id', conversationId)
      .eq('userId', user.id)
      .single()
    if (conv?.messages) {
      storedMessages = conv.messages as StoredMessage[]
    }
  }

  // Call Gemini
  let assistantContent: string
  try {
    assistantContent = await callGemini(
      toGeminiHistory(storedMessages),
      message.trim(),
      systemPrompt,
      model,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'שגיאה לא ידועה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const now = new Date().toISOString()
  const userMsg: StoredMessage = { role: 'user', content: message.trim(), createdAt: now }
  const assistantMsg: StoredMessage = { role: 'assistant', content: assistantContent, createdAt: now }
  const updatedMessages = [...storedMessages, userMsg, assistantMsg]

  await supabase.from('AIConversation').upsert({
    id: convId,
    userId: user.id,
    contextType: contextMode,
    messages: updatedMessages as unknown as Json,
    updatedAt: now,
  }, { onConflict: 'id' })

  return NextResponse.json({
    role: 'assistant',
    content: assistantContent,
    conversationId: convId,
    createdAt: now,
  })
}
