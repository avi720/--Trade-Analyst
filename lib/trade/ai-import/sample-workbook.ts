import ExcelJS from 'exceljs'
import { cellToPrimitive } from './xlsx-cell'
import type { WorkbookSample, SheetSample } from './types'

/** Hard ceiling on total rows across all sheets. Beyond this we refuse the job
 *  rather than send a huge payload to Gemini (cost + context-window safety). */
export const MAX_TOTAL_ROWS = 2000

export class RowCapExceededError extends Error {
  constructor(public readonly total: number) {
    super(`row_cap_exceeded: ${total} rows > ${MAX_TOTAL_ROWS}`)
    this.name = 'RowCapExceededError'
  }
}

export class EmptyWorkbookError extends Error {
  constructor() {
    super('empty_workbook')
    this.name = 'EmptyWorkbookError'
  }
}

/**
 * Loads an xlsx buffer and returns every sheet as a dense 2D array of primitive
 * cell values plus its merged-cell ranges (A1 notation). Unlike the fixed-format
 * parser this makes NO assumptions about headers or column positions — the AI
 * decides structure downstream.
 */
export async function sampleWorkbook(buffer: ArrayBuffer | Buffer): Promise<WorkbookSample> {
  const workbook = new ExcelJS.Workbook()
  // exceljs accepts ArrayBuffer or Node Buffer; normalise Node Buffer to a view.
  await workbook.xlsx.load(buffer as ArrayBuffer)

  const worksheets = workbook.worksheets.filter((ws) => ws.rowCount > 0)
  if (worksheets.length === 0) throw new EmptyWorkbookError()

  const projectedTotal = worksheets.reduce((sum, ws) => sum + ws.rowCount, 0)
  if (projectedTotal > MAX_TOTAL_ROWS) throw new RowCapExceededError(projectedTotal)

  const sheets: SheetSample[] = []
  let totalRowCount = 0

  for (const ws of worksheets) {
    const rowCount = ws.rowCount
    const columnCount = ws.columnCount
    const rows: unknown[][] = []

    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r)
      const cells: unknown[] = []
      for (let c = 1; c <= columnCount; c++) {
        cells.push(cellToPrimitive(row.getCell(c).value))
      }
      rows.push(cells)
    }

    sheets.push({
      name: ws.name,
      rows,
      mergedRanges: readMergedRanges(ws),
    })
    totalRowCount += rowCount
  }

  return { sheets, totalRowCount }
}

/** exceljs exposes merges as A1-notation range strings on the worksheet model. */
function readMergedRanges(ws: ExcelJS.Worksheet): string[] {
  const model = ws.model as unknown as { merges?: string[] }
  return Array.isArray(model.merges) ? [...model.merges] : []
}
