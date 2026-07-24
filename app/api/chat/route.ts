import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, callGeminiWithTools, type ChatMessage } from '@/lib/chat/gemini-client'
import { checkRateLimit, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { logAuditEvent } from '@/lib/audit/log'
import { getUserTier, isProTier, proRequiredResponse } from '@/lib/billing/tier'
import { calcStats } from '@/lib/utils/calculations'
import { computeResearchAggregates, type ResearchAggregates } from '@/lib/utils/research-aggregate'
import {
  buildChatContext,
  CHAT_TRADE_COLUMNS,
  type ChatTrade,
} from '@/lib/chat/context-builder'
import { buildSystemPrompt } from '@/lib/chat/system-prompt'
import { buildToolRuntime, toolNamesForMode } from '@/lib/chat/tools'
import type { TradeFreeText } from '@/lib/chat/tools/types'
import type { Json } from '@/lib/db/types'

type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
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

/**
 * Resolves the free-text annotations for a specific page of trades.
 *
 * These columns are absent from `CHAT_TRADE_COLUMNS` on purpose — one trade can
 * carry ~12,000 chars across the three, so fetching them for the whole history
 * would reintroduce exactly the payload problem P1 exists to fix. `queryTrades`
 * calls this only for the ≤150 rows it is about to return, which keeps the
 * `.in()` filter well inside PostgREST's URL limits.
 */
async function fetchFreeText(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ids: string[],
): Promise<Map<string, TradeFreeText>> {
  const out = new Map<string, TradeFreeText>()
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('Trade')
    .select('id, notes, didRight, wouldChange')
    .eq('userId', userId)
    .in('id', ids)

  if (error) {
    console.error('[chat] free-text fetch failed:', error)
    return out
  }
  for (const row of data ?? []) {
    out.set(row.id, {
      notes: row.notes,
      didRight: row.didRight,
      wouldChange: row.wouldChange,
    })
  }
  return out
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
  // P1-E: opting out of the dashboard filter is Pro-only. The sidebar disables
  // the toggle for Free, but the UI is not the enforcement point — a crafted
  // POST would otherwise widen the scope to the full history.
  const respectFilter = isProTier(tier) ? (body.respectFilter ?? true) : true

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

  const mode = contextMode === 'full' ? 'full' : 'smart'
  const stats = calcStats(trades)

  // Probe first: does the projected set fit inline? Only the answer to that
  // decides whether this turn is a plain call or a tool-driven one.
  const probe = buildChatContext({ trades, mode, stats, filterActive: filterIds !== null })

  // Above the budget the answer needs tool-use round-trips, which are a Pro
  // capability. Free tier gets an actionable message rather than a silently
  // truncated answer.
  if (probe.overThreshold && !isProTier(tier)) {
    return NextResponse.json(
      {
        error:
          `ההיקף הנוכחי (${probe.totalCount} טריידים) גדול מכדי לנתח בבת אחת במסלול החינמי. ` +
          'צמצם את הסינון בלוח התחקור, או שדרג ל-Pro לניתוח על כל ההיסטוריה.',
        errorCode: 'context_too_large',
        totalCount: probe.totalCount,
      },
      { status: 403 },
    )
  }

  const useTools = probe.overThreshold
  const context = useTools
    ? buildChatContext({ trades, mode, stats, filterActive: filterIds !== null, omitRows: true })
    : probe

  // P1-D: Gemini 2.5 rejects a request carrying both `googleSearch` and custom
  // `functionDeclarations`, so grounding is offered only on turns that register
  // no tools. That is *tool-call* XOR web, not data XOR web — a grounded turn
  // still has the inline rows and KPIs as plain prompt text.
  const webSearch = isProTier(tier) && !useTools

  const systemPrompt = buildSystemPrompt({
    context: context.contextString,
    mode,
    toolNames: useTools ? toolNamesForMode(mode) : undefined,
    webSearch,
  })
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
    if (useTools) {
      // One memo per turn: three aggregation calls in the same conversation
      // walk the trade array once, not three times.
      let cached: ResearchAggregates | null = null
      const runtime = buildToolRuntime(mode, {
        trades,
        mode,
        aggregates: () => (cached ??= computeResearchAggregates(trades)),
        fetchFreeText: ids => fetchFreeText(supabase, user.id, ids),
      })

      const result = await callGeminiWithTools(
        toGeminiHistory(storedMessages),
        message.trim(),
        systemPrompt,
        model,
        runtime,
      )
      assistantContent = result.text
      console.log('[chat] tool turn', {
        mode,
        inScope: context.totalCount,
        toolCalls: result.toolCalls.map(c => c.name),
        exhausted: result.exhausted,
        usage: result.usage,
      })
    } else {
      assistantContent = await callGemini(
        toGeminiHistory(storedMessages),
        message.trim(),
        systemPrompt,
        model,
        undefined,
        undefined,
        webSearch,
      )
    }
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
