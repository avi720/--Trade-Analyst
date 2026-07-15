import type { ManualLeg } from '@/lib/trade/manual-entry'
import { sampleWorkbook } from './sample-workbook'
import { extract, type ExtractOptions } from './extract'
import { applyMapping } from './apply-mapping'
import { finalizeLegs } from './finalize-legs'
import type { AiMapping, LegError } from './types'

/** Lightweight, audit-friendly summary of the AI's decision (no bulky legs). */
export interface AiMappingSummary {
  mode: 'mapping' | 'extraction'
  confidence: number
  notes: string
  sheetName?: string
  rowsCovered?: number
}

export interface ProcessResult {
  aiMapping: AiMappingSummary
  extractedLegs: ManualLeg[]
  parseErrors: LegError[]
  rowCountRaw: number
}

function summarize(mapping: AiMapping): AiMappingSummary {
  if (mapping.mode === 'mapping') {
    return {
      mode: 'mapping',
      confidence: mapping.confidence,
      notes: mapping.notes,
      sheetName: mapping.sheetName,
    }
  }
  return {
    mode: 'extraction',
    confidence: mapping.confidence,
    notes: mapping.notes,
    rowsCovered: mapping.rowsCovered,
  }
}

/**
 * End-to-end pure pipeline: sample the workbook, run the AI cascade, apply the
 * mapping (or take the AI's extracted legs), inject the user's timezone, and
 * validate. Shared by the GitHub-runner worker and the test suite. Does no I/O
 * beyond the Gemini call inside `extract` (which is injectable via opts.call).
 */
export async function processWorkbook(
  buffer: ArrayBuffer | Buffer,
  sourceTimezone: string,
  opts?: ExtractOptions,
): Promise<ProcessResult> {
  const sample = await sampleWorkbook(buffer)
  const mapping = await extract(sample, opts)

  let rawLegs: Array<Record<string, unknown>>
  let applyErrors: LegError[] = []

  if (mapping.mode === 'mapping') {
    const sheet =
      sample.sheets.find((s) => s.name === mapping.sheetName) ?? sample.sheets[0]
    const applied = applyMapping(sheet?.rows ?? [], mapping)
    rawLegs = applied.legs as unknown as Array<Record<string, unknown>>
    applyErrors = applied.errors
  } else {
    rawLegs = mapping.legs as unknown as Array<Record<string, unknown>>
  }

  const { legs, errors: finalizeErrors } = finalizeLegs(rawLegs, sourceTimezone)

  return {
    aiMapping: summarize(mapping),
    extractedLegs: legs,
    parseErrors: [...applyErrors, ...finalizeErrors],
    rowCountRaw: sample.totalRowCount,
  }
}
