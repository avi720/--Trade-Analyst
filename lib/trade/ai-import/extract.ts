import { GoogleGenAI } from '@google/genai'
import {
  aiMappingSchema,
  MAPPABLE_FIELDS,
  type AiMapping,
  type ExtractionResult,
  type AiLeg,
  type WorkbookSample,
  type SheetSample,
} from './types'

export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro'

/** Injectable one-shot Gemini call. Returns the raw model text (expected JSON). */
export interface GeminiCall {
  (args: { systemPrompt: string; userPrompt: string; model: GeminiModel }): Promise<string>
}

export interface ExtractOptions {
  call?: GeminiCall
  timeoutMs?: number
  retries?: number
  delayFn?: (ms: number) => Promise<void>
  /** Row-window size for extraction-mode chunking of large sheets. */
  chunkSize?: number
}

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_CHUNK = 80
const CHUNK_OVERLAP = 5
const CONFIDENCE_FLOOR = 0.6

function isRetryable(error: unknown): boolean {
  const anyErr = error as Record<string, unknown>
  if (typeof anyErr?.status === 'number') {
    const s = anyErr.status as number
    return s === 429 || (s >= 500 && s < 600)
  }
  if (error instanceof Error) {
    const msg = error.message
    return (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('quota') ||
      msg.includes('gemini_timeout') ||
      /5\d\d/.test(msg) ||
      error.name === 'FetchError'
    )
  }
  return false
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('gemini_timeout')), ms)
  })
  return Promise.race([p.finally(() => clearTimeout(timer)), timeout])
}

/** Default caller — real Gemini via @google/genai, JSON mode, temperature 0. */
function makeDefaultCall(timeoutMs: number): GeminiCall {
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  return async ({ systemPrompt, userPrompt, model }) => {
    const res = await withTimeout(
      genAI.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0,
        },
      }),
      timeoutMs,
    )
    return res.text ?? ''
  }
}

// ─── Prompts ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You convert a user's personal trading spreadsheet into structured trade legs for a trading journal.

The target schema (a "leg" = one execution) has these fields:
- ticker (string, required), date (required), time (HH:MM), side ("BUY" | "SELL", required),
  quantity (positive number, required), price (positive number, required),
  commission (number), currency (one of USD,EUR,ILS,GBP,JPY,CHF,CAD,AUD,CNY,HKD)
- optional: commissionCurrency, orderType, orderPlacedDate, orderPlacedTime, broker,
  setupType, emotionalState, stopPrice, targetPrice, notes, didRight

You receive the workbook as JSON: each sheet has a 0-indexed "rows" array (arrays of cell
values) and "mergedRanges" (A1 ranges of merged cells). You MUST reply with a single JSON
object, no prose, in ONE of two shapes:

1) FLAT TABLE — choose this ONLY when all trades sit in one simple rectangular table with a
   single header row and no merged cells inside the data region:
{
  "mode": "mapping",
  "sheetName": string,
  "headerRowIndex": number,          // 0-based index of the header row
  "dataStartRowIndex": number,       // 0-based index of the first data row
  "columnMap": { "<field>": <0-based column index or null>, ... },  // only the fields above
  "transformations": {
    "dateFormat": "iso" | "dd/MM/yyyy" | "MM/dd/yyyy" | "dd-MM-yyyy" | "excel-serial",
    "timeFormat": "HH:mm" | "HH:mm:ss" | "h:mm a" | "excel-serial" | null,
    "sideEncoding": "text" | "signed-quantity",   // signed-quantity: sign of the quantity cell IS the side
    "sideMap": { "buy": [raw values meaning buy], "sell": [raw values meaning sell] },
    "defaultCurrency": one of the currency codes
  },
  "confidence": number (0..1),
  "notes": string
}

2) COMPLEX LAYOUT — choose this when the sheet has merged cells inside the data, sub-tables,
   grouped/section headers, vertical labels, or anything that is not a single flat table.
   Extract every trade leg directly:
{
  "mode": "extraction",
  "legs": [ { ...leg fields... }, ... ],   // do NOT include a timezone field
  "confidence": number (0..1),
  "notes": string,
  "rowsCovered": number   // how many source rows you turned into legs
}

Rules:
- NEVER infer or output a timezone — the app supplies it.
- Dates must reflect what is written; do not shift them.
- If a value is absent, omit the field (mapping: set the column to null).
- Prefer "mapping" when possible; it is cheaper and more reliable.`

const FIELD_LIST = MAPPABLE_FIELDS.join(', ')

function buildUserPrompt(sample: WorkbookSample): string {
  return JSON.stringify({
    mappableFields: FIELD_LIST,
    totalRowCount: sample.totalRowCount,
    sheets: sample.sheets.map((s) => ({
      name: s.name,
      mergedRanges: s.mergedRanges,
      rows: s.rows,
    })),
  })
}

function buildChunkPrompt(sheetName: string, rows: unknown[][], mergedRanges: string[]): string {
  return JSON.stringify({
    instruction:
      'This is a slice of a larger sheet. Return mode "extraction" with every trade leg you find in these rows.',
    sheetName,
    mergedRanges,
    rows,
  })
}

// ─── Core call with retry + JSON validation ───────────────────────────────

async function callAndParse(
  call: GeminiCall,
  systemPrompt: string,
  userPrompt: string,
  model: GeminiModel,
  retries: number,
  delayFn: (ms: number) => Promise<void>,
): Promise<AiMapping> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await call({ systemPrompt, userPrompt, model })
      const json = JSON.parse(stripCodeFence(raw))
      const parsed = aiMappingSchema.safeParse(json)
      if (parsed.success) return parsed.data
      // Schema mismatch — treat like a transient bad response and retry.
      lastErr = new Error(`ai_schema_mismatch: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
    } catch (err) {
      lastErr = err
      if (!(err instanceof SyntaxError) && !isRetryable(err)) throw err
    }
    if (attempt < retries) await delayFn(RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)])
  }
  throw lastErr instanceof Error ? lastErr : new Error('ai_extract_failed')
}

/** Gemini occasionally wraps JSON in ```json fences despite JSON mode. */
function stripCodeFence(s: string): string {
  const t = s.trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return t
}

function legKey(l: AiLeg): string {
  return `${l.ticker}|${l.date}|${l.time ?? ''}|${l.side}|${l.quantity}|${l.price}`
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Runs the AI cascade over a sampled workbook and returns a validated AiMapping.
 * - Starts on flash; if confidence is low, retries once on pro.
 * - For extraction results that under-cover a large sheet, chunks the sheet and
 *   merges the legs.
 * The caller (mapping mode) or this function (extraction mode) produces legs;
 * timezone injection + strict validation happen later in finalize-legs.
 */
export async function extract(sample: WorkbookSample, opts: ExtractOptions = {}): Promise<AiMapping> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = opts.retries ?? 4
  const delayFn = opts.delayFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK
  const call = opts.call ?? makeDefaultCall(timeoutMs)

  const systemPrompt = SYSTEM_PROMPT
  const userPrompt = buildUserPrompt(sample)

  let result = await callAndParse(call, systemPrompt, userPrompt, 'gemini-2.5-flash', retries, delayFn)

  // Low-confidence upgrade: one pass on pro.
  if (result.confidence < CONFIDENCE_FLOOR) {
    try {
      result = await callAndParse(call, systemPrompt, userPrompt, 'gemini-2.5-pro', retries, delayFn)
    } catch {
      // keep the flash result if the upgrade attempt fails
    }
  }

  if (result.mode === 'mapping') return result

  // Extraction: chunk large sheets if coverage looks incomplete.
  const primary = pickPrimarySheet(sample)
  const needsChunking =
    primary != null &&
    primary.rows.length > chunkSize &&
    result.rowsCovered < primary.rows.length * 0.9

  if (!needsChunking || primary == null) return result

  const merged = new Map<string, AiLeg>()
  for (const leg of result.legs) merged.set(legKey(leg), leg)

  for (let start = 0; start < primary.rows.length; start += chunkSize - CHUNK_OVERLAP) {
    const slice = primary.rows.slice(start, start + chunkSize)
    if (slice.length === 0) break
    const chunkPrompt = buildChunkPrompt(primary.name, slice, primary.mergedRanges)
    try {
      const chunkRes = await callAndParse(
        call,
        systemPrompt,
        chunkPrompt,
        'gemini-2.5-flash',
        retries,
        delayFn,
      )
      if (chunkRes.mode === 'extraction') {
        for (const leg of chunkRes.legs) merged.set(legKey(leg), leg)
      }
    } catch {
      // A failed chunk shouldn't sink the whole job — keep what we have.
    }
    if (start + chunkSize >= primary.rows.length) break
  }

  const legs = Array.from(merged.values())
  const out: ExtractionResult = {
    mode: 'extraction',
    legs,
    confidence: result.confidence,
    notes: result.notes,
    rowsCovered: legs.length,
  }
  return out
}

function pickPrimarySheet(sample: WorkbookSample): SheetSample | null {
  if (sample.sheets.length === 0) return null
  return sample.sheets.reduce((a, b) => (b.rows.length > a.rows.length ? b : a))
}
