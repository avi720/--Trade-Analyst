import type ExcelJS from 'exceljs'

/**
 * Unwrap an exceljs cell value (string, number, Date, formula-result wrapper,
 * rich text, or hyperlink) into a plain JS primitive. Shared by the fixed-format
 * Excel importer (lib/trade/excel-import.ts) and the AI-import sampler
 * (lib/trade/ai-import/sample-workbook.ts) so both read cells identically.
 *
 * Type-only import of ExcelJS — no runtime dependency, safe to import anywhere.
 */
export function cellToPrimitive(v: ExcelJS.CellValue): unknown {
  if (v == null) return ''
  if (typeof v === 'object') {
    // Formula result: { formula, result }
    if ('result' in v && v.result !== undefined) return v.result
    // Rich text: { richText: [{ text }, ...] }
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((p) => p.text).join('')
    }
    // Hyperlink: { text, hyperlink }
    if ('text' in v) return v.text
    // Date
    if (v instanceof Date) return v
  }
  return v
}
