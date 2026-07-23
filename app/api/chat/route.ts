import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, type ChatMessage } from '@/lib/chat/gemini-client'
import { checkRateLimit, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { logAuditEvent } from '@/lib/audit/log'
import { getUserTier, isProTier, proRequiredResponse } from '@/lib/billing/tier'
import { calcStats } from '@/lib/utils/calculations'
import {
  buildChatContext,
  CHAT_TRADE_COLUMNS,
  type ChatTrade,
} from '@/lib/chat/context-builder'
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

אל תניח שראית את כל ההיסטוריה — הסתמך רק על מה שמופיע למטה. אם נשלחו אליך פחות שורות מסך הטריידים בהיקף, ציין את זה במפורש בתשובה כדי שהמשתמש יוכל לבקש השוואה רחבה יותר.

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

// The client tells us which trades the dashboard filter currently matches, but
// only when the filter actually narrows the set — see `research-dashboard.tsx`.
// The IDs are applied in memory rather than as a `WHERE id IN (...)`: a couple
// of thousand UUIDs in a PostgREST query string blows past URL length limits,
// and the underlying SELECT is identical either way.
function extractTradeIds(contextData: unknown): Set<string> | null {
  if (!contextData || typeof contextData !== 'object') return null
  const ids = (contextData as { tradeIds?: unknown }).tradeIds
  if (!Array.isArray(ids)) return null
  return new Set(ids.filter((v): v is string => typeof v === 'string'))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tier } = await getUserTier(user.id)

  // Hourly cap (both tiers) — Gemini cost protection + compromised-session quota burn defense.
  const rlHour = await checkRateLimit(`user:${user.id}:chat`, 30, 3600)
  if (!rlHour.ok) {
    await logAuditEvent({
      userId: user.id,
      eventType: 'rate_limit_hit',
      status: 'failure',
      metadata: { action: 'chat', bucket: 'hourly' },
      request,
    })
    return rateLimitedResponse(rlHour, 'הגעת למגבלת ההודעות לשעה. נסה שוב מאוחר יותר')
  }

  // Daily cap for Free tier only — 3 messages per day.
  if (!isProTier(tier)) {
    const rlDay = await checkRateLimit(`user:${user.id}:chat:daily-free`, 3, 86400)
    if (!rlDay.ok) {
      await logAuditEvent({
        userId: user.id,
        eventType: 'rate_limit_hit',
        status: 'failure',
        metadata: { action: 'chat', bucket: 'daily_free' },
        request,
      })
      return rateLimitedResponse(
        rlDay,
        'הגעת למכסת 3 ההודעות היומית של המסלול החינמי. שדרג ל-Pro להודעות ללא הגבלה',
      )
    }
  }

  let body: {
    message: string
    conversationId?: string
    contextMode: 'smart' | 'full'
    respectFilter?: boolean
    contextData?: Record<string, unknown>
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { message, conversationId, contextMode, contextData } = body
  // P1-E replaces this default with the sidebar toggle. Until then every
  // conversation respects the dashboard filter, which is today's behavior.
  const respectFilter = body.respectFilter ?? true

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  // Pro mode (full-history context) is Pro-only.
  if (contextMode === 'full' && !isProTier(tier)) {
    return proRequiredResponse('chat_pro_mode')
  }

  // P1: the server owns the trade data for both modes. The client only says
  // *which* trades are in scope; it never ships the rows themselves.
  const filterIds = respectFilter ? extractTradeIds(contextData) : null

  const { data: rows, error: tradesError } = await supabase
    .from('Trade')
    .select(CHAT_TRADE_COLUMNS)
    .eq('userId', user.id)
    .eq('status', 'Closed')

  if (tradesError) {
    console.error('[chat] trade fetch failed:', tradesError)
    return NextResponse.json({ error: 'לא הצלחנו לטעון את הטריידים שלך. נסה שוב.' }, { status: 500 })
  }

  const trades: ChatTrade[] = (rows ?? [])
    .filter(r => r.closedAt !== null && (!filterIds || filterIds.has(r.id)))
    .map(r => ({
      ...r,
      openedAt: new Date(r.openedAt),
      closedAt: new Date(r.closedAt as string),
    })) as ChatTrade[]

  const context = buildChatContext({
    trades,
    mode: contextMode === 'full' ? 'full' : 'smart',
    stats: calcStats(trades),
    filterActive: filterIds !== null,
  })

  // Above the budget the answer needs tool-use round-trips (P1-C), which are a
  // Pro capability. Free tier gets an actionable message instead of a silently
  // truncated answer.
  if (context.overThreshold && !isProTier(tier)) {
    return NextResponse.json(
      {
        error:
          `ההיקף הנוכחי (${context.totalCount} טריידים) גדול מכדי לנתח בבת אחת במסלול החינמי. ` +
          'צמצם את הסינון בלוח התחקור, או שדרג ל-Pro לניתוח על כל ההיסטוריה.',
        errorCode: 'context_too_large',
        totalCount: context.totalCount,
      },
      { status: 403 },
    )
  }

  const systemPrompt = buildSystemPrompt(context.contextString)
  const model = contextMode === 'full' ? 'gemini-2.5-pro' : 'gemini-2.5-flash'

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
