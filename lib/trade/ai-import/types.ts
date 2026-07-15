import { z } from 'zod'
import { CURRENCIES } from '@/lib/constants/trade-options'
import type { ManualLeg } from '@/lib/trade/manual-entry'

// ─── Workbook sampling ────────────────────────────────────────────────────

export interface SheetSample {
  name: string
  /** All rows, 0-indexed, cells unwrapped to primitives (string | number | Date | ''). */
  rows: unknown[][]
  /** Merged-cell ranges in A1 notation, e.g. "A1:C1". Passed to the AI as structural hints. */
  mergedRanges: string[]
}

export interface WorkbookSample {
  sheets: SheetSample[]
  totalRowCount: number
}

// ─── AI mapping / extraction contract ─────────────────────────────────────
//
// The AI returns ONE of two shapes discriminated by `mode`. We validate the
// parsed JSON with Zod (responseSchema is intentionally NOT used — Gemini's
// schema support for discriminated unions is fragile; a clear prompt +
// responseMimeType:'application/json' + Zod validation is more robust and
// fully testable). `timezone` is never part of the AI output — it is injected
// server-side from the user's explicit choice (see finalize-legs).

// Fields of ManualLeg the AI is allowed to map. `timezone` is excluded on
// purpose — Excel carries no timezone and an AI guess would corrupt FIFO order.
export const MAPPABLE_FIELDS = [
  'ticker', 'date', 'time', 'side', 'quantity', 'price', 'commission', 'currency',
  'commissionCurrency', 'orderType', 'orderPlacedDate', 'orderPlacedTime', 'broker',
  'setupType', 'emotionalState', 'stopPrice', 'targetPrice', 'notes', 'didRight',
] as const
export type MappableField = (typeof MAPPABLE_FIELDS)[number]

const columnMapSchema = z.object(
  Object.fromEntries(
    MAPPABLE_FIELDS.map((f) => [f, z.number().int().nullable().optional()]),
  ) as Record<MappableField, z.ZodOptional<z.ZodNullable<z.ZodNumber>>>,
)
export type ColumnMap = z.infer<typeof columnMapSchema>

const transformationsSchema = z.object({
  dateFormat: z.enum(['iso', 'dd/MM/yyyy', 'MM/dd/yyyy', 'dd-MM-yyyy', 'excel-serial']),
  timeFormat: z.enum(['HH:mm', 'HH:mm:ss', 'h:mm a', 'excel-serial']).nullable(),
  sideEncoding: z.enum(['text', 'signed-quantity']),
  sideMap: z.object({
    buy: z.array(z.string()).default([]),
    sell: z.array(z.string()).default([]),
  }),
  defaultCurrency: z.enum(CURRENCIES),
})
export type Transformations = z.infer<typeof transformationsSchema>

// A leg as the AI returns it in extraction mode. Looser than manualLegSchema:
// numbers may arrive as strings, so we coerce. Final strict validation happens
// in finalize-legs via manualLegSchema. `timezone` is deliberately absent.
export const aiLegSchema = z.object({
  ticker: z.string().min(1),
  date: z.string(),
  time: z.string().optional().default('09:30'),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.coerce.number(),
  price: z.coerce.number(),
  commission: z.coerce.number().default(0),
  currency: z.string().optional(),
  commissionCurrency: z.string().nullish(),
  orderType: z.string().nullish(),
  orderPlacedDate: z.string().nullish(),
  orderPlacedTime: z.string().nullish(),
  // Loose here (finalize-legs sanitizes against BROKERS); a novel broker name
  // must not reject the whole leg.
  broker: z.string().nullish(),
  setupType: z.string().nullish(),
  emotionalState: z.string().nullish(),
  stopPrice: z.coerce.number().nullish(),
  targetPrice: z.coerce.number().nullish(),
  notes: z.string().nullish(),
  didRight: z.string().nullish(),
})
export type AiLeg = z.infer<typeof aiLegSchema>

export const mappingResultSchema = z.object({
  mode: z.literal('mapping'),
  sheetName: z.string(),
  headerRowIndex: z.number().int().min(0),
  dataStartRowIndex: z.number().int().min(0),
  columnMap: columnMapSchema,
  transformations: transformationsSchema,
  confidence: z.number().min(0).max(1),
  notes: z.string().default(''),
})
export type MappingResult = z.infer<typeof mappingResultSchema>

export const extractionResultSchema = z.object({
  mode: z.literal('extraction'),
  legs: z.array(aiLegSchema),
  confidence: z.number().min(0).max(1),
  notes: z.string().default(''),
  rowsCovered: z.number().int().min(0).default(0),
})
export type ExtractionResult = z.infer<typeof extractionResultSchema>

export const aiMappingSchema = z.discriminatedUnion('mode', [
  mappingResultSchema,
  extractionResultSchema,
])
export type AiMapping = z.infer<typeof aiMappingSchema>

// ─── Applying the mapping ─────────────────────────────────────────────────

export interface LegError {
  rowIndex: number
  reason: string
}

export interface ApplyResult {
  /** ManualLeg[] WITHOUT timezone — finalize-legs injects it. */
  legs: ManualLeg[]
  errors: LegError[]
}
