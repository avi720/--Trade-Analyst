/**
 * P1-C — `queryTrades`: raw-row retrieval tool for the chat assistant.
 *
 * Registered only when the in-scope set blew the inline byte budget. Instead of
 * dumping rows into the system prompt, the model pulls the slice it needs.
 *
 * Two things this module is strict about:
 *
 * 1. **The mode gate is enforced here, in the executor** — not merely described
 *    in the declaration. A declaration description is a suggestion to a model;
 *    the field gate that keeps `openedAt` / `executionQuality` /
 *    `emotionalState` / free text Pro-only is a product boundary, so it has to
 *    hold even when the model asks for a forbidden field anyway. Forbidden
 *    input is dropped, never thrown on: a thrown tool error costs a whole
 *    round-trip and teaches the model nothing, whereas `droppedFields` + a
 *    Hebrew `note` lets it tell the user why the answer is thinner.
 *
 * 2. **The limit cap is absolute.** `QUERY_TRADES_MAX_LIMIT` clamps; a bigger
 *    request is served by paginating with `offset`, never by honouring it.
 */

import { Type } from '@google/genai'
import type { ChatContextMode, ChatTrade } from '@/lib/chat/context-builder'
import {
  QUERY_TRADES_DEFAULT_LIMIT,
  QUERY_TRADES_MAX_LIMIT,
  type ChatTool,
  type ToolContext,
} from '@/lib/chat/tools/types'

const SMART_FIELDS = [
  'ticker',
  'direction',
  'setup',
  'actualR',
  'realizedPnl',
  'result',
  'closedAt',
] as const

const FULL_ONLY_FIELDS = [
  'openedAt',
  'executionQuality',
  'emotionalState',
  'notes',
  'didRight',
  'wouldChange',
] as const

const FREE_TEXT_FIELDS = ['notes', 'didRight', 'wouldChange'] as const

type FieldName = (typeof SMART_FIELDS)[number] | (typeof FULL_ONLY_FIELDS)[number]

const ALL_FIELDS: readonly FieldName[] = [...SMART_FIELDS, ...FULL_ONLY_FIELDS]

/** Fields the mode may see at all. */
function allowedFields(mode: ChatContextMode): readonly FieldName[] {
  return mode === 'full' ? ALL_FIELDS : SMART_FIELDS
}

/**
 * What `fields` defaults to when the caller omits it. Free text is opt-in even
 * in full mode — one trade can carry ~12,000 chars across the three columns, so
 * including it by default would recreate the payload blowup this tool exists to
 * avoid.
 */
function defaultFields(mode: ChatContextMode): FieldName[] {
  return allowedFields(mode).filter(f => !isFreeText(f))
}

function isFreeText(f: string): f is (typeof FREE_TEXT_FIELDS)[number] {
  return (FREE_TEXT_FIELDS as readonly string[]).includes(f)
}

type OrderBy = 'closedAt' | 'openedAt' | 'actualR' | 'realizedPnl' | 'ticker'
const ORDER_BY_VALUES: readonly OrderBy[] = ['closedAt', 'openedAt', 'actualR', 'realizedPnl', 'ticker']

// `openedAt` is a full-only column, so ordering by it in smart mode would leak
// the ordering it gates (the model could binary-search entry times).
const SMART_FORBIDDEN_ORDER_BY: readonly string[] = ['openedAt']

interface Filters {
  ticker?: string
  direction?: 'Long' | 'Short'
  result?: string
  setup?: string
  emotionalState?: string
  minR?: number
  maxR?: number
  minPnl?: number
  maxPnl?: number
  closedFrom?: string
  closedTo?: string
  openedFrom?: string
  openedTo?: string
}

export interface QueryTradesResult {
  rows: Array<Record<string, unknown>>
  returned: number
  matched: number
  totalInScope: number
  offset: number
  limit: number
  hasMore: boolean
  droppedFields?: string[]
  note?: string
}

// --- arg coercion -----------------------------------------------------------
// The model supplies JSON, so every value arrives as `unknown` and may be the
// wrong primitive. Anything unusable is treated as "not provided" rather than
// as an error.

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/**
 * Bound parsing for the date filters. A bare `YYYY-MM-DD` is expanded to cover
 * the whole UTC day so `closedTo: '2026-03-02'` includes trades closed that
 * afternoon — an inclusive-bound reading is what a user means by "until".
 */
function parseBound(v: unknown, edge: 'start' | 'end'): number | undefined {
  const s = asString(v)
  if (!s) return undefined
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s)
  const iso = dateOnly ? `${s}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z` : s
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

function parseFilters(raw: unknown, mode: ChatContextMode): { filters: Filters; dropped: string[] } {
  const r = asRecord(raw)
  const dropped: string[] = []
  const filters: Filters = {}

  filters.ticker = asString(r.ticker)
  const dir = asString(r.direction)
  if (dir === 'Long' || dir === 'Short') filters.direction = dir
  filters.result = asString(r.result)
  filters.setup = asString(r.setup)

  // Gated: emotionalState is a full-only column, so it cannot be used as a
  // filter in smart mode either — filtering by a hidden field still discloses it.
  const emo = asString(r.emotionalState)
  if (emo !== undefined) {
    if (mode === 'full') filters.emotionalState = emo
    else dropped.push('emotionalState')
  }

  filters.minR = asNumber(r.minR)
  filters.maxR = asNumber(r.maxR)
  filters.minPnl = asNumber(r.minPnl)
  filters.maxPnl = asNumber(r.maxPnl)
  filters.closedFrom = asString(r.closedFrom)
  filters.closedTo = asString(r.closedTo)

  const openedFrom = asString(r.openedFrom)
  const openedTo = asString(r.openedTo)
  if (openedFrom !== undefined || openedTo !== undefined) {
    if (mode === 'full') {
      filters.openedFrom = openedFrom
      filters.openedTo = openedTo
    } else {
      dropped.push('openedAt')
    }
  }

  return { filters, dropped }
}

function matches(t: ChatTrade, f: Filters): boolean {
  if (f.ticker && !t.ticker.toLowerCase().includes(f.ticker.toLowerCase())) return false
  if (f.direction && t.direction !== f.direction) return false
  if (f.result !== undefined && t.result !== f.result) return false
  if (f.setup !== undefined && t.setupType !== f.setup) return false
  if (f.emotionalState !== undefined && t.emotionalState !== f.emotionalState) return false

  // A null actualR is "unmeasurable", not zero — it must never satisfy an R filter.
  if (f.minR !== undefined && (t.actualR === null || t.actualR < f.minR)) return false
  if (f.maxR !== undefined && (t.actualR === null || t.actualR > f.maxR)) return false

  if (f.minPnl !== undefined && t.realizedPnl < f.minPnl) return false
  if (f.maxPnl !== undefined && t.realizedPnl > f.maxPnl) return false

  const closedFrom = parseBound(f.closedFrom, 'start')
  if (closedFrom !== undefined && t.closedAt.getTime() < closedFrom) return false
  const closedTo = parseBound(f.closedTo, 'end')
  if (closedTo !== undefined && t.closedAt.getTime() > closedTo) return false

  const openedFrom = parseBound(f.openedFrom, 'start')
  if (openedFrom !== undefined && t.openedAt.getTime() < openedFrom) return false
  const openedTo = parseBound(f.openedTo, 'end')
  if (openedTo !== undefined && t.openedAt.getTime() > openedTo) return false

  return true
}

function sortKey(t: ChatTrade, by: OrderBy): number | string | null {
  switch (by) {
    case 'closedAt': return t.closedAt.getTime()
    case 'openedAt': return t.openedAt.getTime()
    case 'actualR': return t.actualR
    case 'realizedPnl': return t.realizedPnl
    case 'ticker': return t.ticker
  }
}

/**
 * Sorts a copy, nulls last in both directions, ties broken by original index so
 * the order is stable and pagination can't repeat or skip a row across calls.
 */
function sortTrades(trades: ChatTrade[], by: OrderBy, desc: boolean): ChatTrade[] {
  return trades
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const ka = sortKey(a.t, by)
      const kb = sortKey(b.t, by)
      if (ka === null && kb === null) return a.i - b.i
      if (ka === null) return 1
      if (kb === null) return -1
      let cmp: number
      if (typeof ka === 'string' && typeof kb === 'string') cmp = ka.localeCompare(kb)
      else cmp = (ka as number) - (kb as number)
      if (cmp === 0) return a.i - b.i
      return desc ? -cmp : cmp
    })
    .map(x => x.t)
}

function projectRow(t: ChatTrade, fields: FieldName[]): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const f of fields) {
    switch (f) {
      case 'ticker': row.ticker = t.ticker; break
      case 'direction': row.direction = t.direction; break
      case 'setup': row.setup = t.setupType; break
      case 'actualR': row.actualR = t.actualR; break
      case 'realizedPnl': row.realizedPnl = t.realizedPnl; break
      case 'result': row.result = t.result; break
      case 'closedAt': row.closedAt = t.closedAt.toISOString(); break
      case 'openedAt': row.openedAt = t.openedAt.toISOString(); break
      case 'executionQuality': row.executionQuality = t.executionQuality; break
      case 'emotionalState': row.emotionalState = t.emotionalState; break
      // Free text is merged in afterwards, once the page is known.
      case 'notes':
      case 'didRight':
      case 'wouldChange':
        break
    }
  }
  return row
}

const filtersSchema = {
  type: Type.OBJECT,
  description: 'מסננים אופציונליים. כל שדה שלא צוין — לא מסנן.',
  properties: {
    ticker: { type: Type.STRING, description: 'התאמת תת-מחרוזת, לא רגיש לאותיות גדולות/קטנות' },
    direction: { type: Type.STRING, enum: ['Long', 'Short'] },
    result: { type: Type.STRING, description: 'התאמה מדויקת, למשל Win / Loss / Breakeven' },
    setup: { type: Type.STRING, description: 'שם סטאפ — התאמה מדויקת' },
    emotionalState: { type: Type.STRING, description: 'מצב רגשי — התאמה מדויקת. זמין רק במצב עומק (Pro)' },
    minR: { type: Type.NUMBER, description: 'actualR מינימלי. טרייד ללא סטופ (actualR ריק) לעולם לא יתאים' },
    maxR: { type: Type.NUMBER, description: 'actualR מקסימלי. טרייד ללא סטופ לעולם לא יתאים' },
    minPnl: { type: Type.NUMBER, description: 'realizedPnl מינימלי' },
    maxPnl: { type: Type.NUMBER, description: 'realizedPnl מקסימלי' },
    closedFrom: { type: Type.STRING, description: 'תאריך/זמן ISO — כולל את הגבול' },
    closedTo: { type: Type.STRING, description: 'תאריך/זמן ISO — כולל את הגבול' },
    openedFrom: { type: Type.STRING, description: 'תאריך/זמן ISO. זמין רק במצב עומק (Pro)' },
    openedTo: { type: Type.STRING, description: 'תאריך/זמן ISO. זמין רק במצב עומק (Pro)' },
  },
}

export const queryTradesTool: ChatTool = {
  name: 'queryTrades',
  modes: ['smart', 'full'],
  declaration: {
    name: 'queryTrades',
    description:
      'מחזיר שורות טריידים סגורים מתוך ההיקף הנוכחי, עם סינון, מיון ועימוד. ' +
      `ברירת מחדל ${QUERY_TRADES_DEFAULT_LIMIT} שורות, מקסימום ${QUERY_TRADES_MAX_LIMIT} לקריאה — ` +
      'ליותר מכך יש לעמד באמצעות offset. השדות notes/didRight/wouldChange ארוכים מאוד — ' +
      'בקש אותם רק כשהשאלה באמת דורשת אותם, ובמקביל הקטן את limit.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filters: filtersSchema,
        fields: {
          type: Type.ARRAY,
          items: { type: Type.STRING, enum: [...ALL_FIELDS] },
          description:
            'אילו שדות להחזיר בכל שורה. ברירת מחדל: כל השדות המותרים במצב הנוכחי, ללא שדות הטקסט החופשי.',
        },
        orderBy: { type: Type.STRING, enum: [...ORDER_BY_VALUES], description: 'ברירת מחדל closedAt' },
        direction: { type: Type.STRING, enum: ['asc', 'desc'], description: 'ברירת מחדל desc' },
        limit: { type: Type.INTEGER, description: `1..${QUERY_TRADES_MAX_LIMIT}` },
        offset: { type: Type.INTEGER, description: 'לעימוד. ברירת מחדל 0' },
      },
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<QueryTradesResult> {
    const mode = ctx.mode
    const allowed = allowedFields(mode)
    const dropped = new Set<string>()

    // --- fields ---
    const rawFields = Array.isArray(args.fields) ? args.fields : undefined
    let fields: FieldName[]
    if (rawFields) {
      fields = []
      for (const raw of rawFields) {
        const f = asString(raw)
        if (!f) continue
        if (!(ALL_FIELDS as readonly string[]).includes(f)) continue
        if (!(allowed as readonly string[]).includes(f)) { dropped.add(f); continue }
        if (!fields.includes(f as FieldName)) fields.push(f as FieldName)
      }
      // An all-forbidden (or all-garbage) field list would otherwise return
      // empty objects — fall back so the model still gets something usable.
      if (fields.length === 0) fields = defaultFields(mode)
    } else {
      fields = defaultFields(mode)
    }

    // --- filters ---
    const { filters, dropped: droppedFilters } = parseFilters(args.filters, mode)
    droppedFilters.forEach(d => dropped.add(d))

    // --- ordering ---
    const rawOrderBy = asString(args.orderBy)
    let orderBy: OrderBy = 'closedAt'
    if (rawOrderBy && (ORDER_BY_VALUES as readonly string[]).includes(rawOrderBy)) {
      if (mode === 'smart' && SMART_FORBIDDEN_ORDER_BY.includes(rawOrderBy)) dropped.add(rawOrderBy)
      else orderBy = rawOrderBy as OrderBy
    }
    const desc = asString(args.direction) !== 'asc'

    // --- paging ---
    const rawLimit = asNumber(args.limit)
    const limit = rawLimit === undefined
      ? QUERY_TRADES_DEFAULT_LIMIT
      : Math.min(QUERY_TRADES_MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    const rawOffset = asNumber(args.offset)
    const offset = rawOffset === undefined ? 0 : Math.max(0, Math.floor(rawOffset))

    const matchedTrades = ctx.trades.filter(t => matches(t, filters))
    const page = sortTrades(matchedTrades, orderBy, desc).slice(offset, offset + limit)
    const rows = page.map(t => projectRow(t, fields))

    // --- free text: only for the page we are about to return ---
    const wantedFreeText = fields.filter(isFreeText)
    if (wantedFreeText.length > 0 && mode === 'full' && page.length > 0) {
      const byId = await ctx.fetchFreeText(page.map(t => t.id))
      page.forEach((t, i) => {
        const ft = byId.get(t.id)
        for (const f of wantedFreeText) rows[i][f] = ft ? ft[f] : null
      })
    }

    const matched = matchedTrades.length
    const hasMore = matched > offset + rows.length

    const result: QueryTradesResult = {
      rows,
      returned: rows.length,
      matched,
      totalInScope: ctx.trades.length,
      offset,
      limit,
      hasMore,
    }

    const notes: string[] = []
    if (dropped.size > 0) {
      result.droppedFields = [...dropped]
      notes.push(
        `השדות ${[...dropped].join(', ')} זמינים רק במצב עומק (Pro) ולכן לא נכללו — אל תתייחס אליהם בתשובה.`,
      )
    }
    if (hasMore) {
      notes.push(
        `הוחזרו ${rows.length} שורות מתוך ${matched} שתואמות — ציין במפורש על איזה היקף התבססת, או המשך לעמד עם offset.`,
      )
    }
    if (notes.length > 0) result.note = notes.join(' ')

    return result
  },
}
