/**
 * AI-Excel-import worker — runs on the GitHub Actions runner, NOT on Vercel
 * (Vercel Hobby caps functions at 60s; the Gemini cascade can exceed that).
 *
 * Least-privilege: this process holds only SITE_URL + CRON_SECRET +
 * GEMINI_API_KEY. It has NO Supabase URL or service-role key. Every DB/Storage
 * touch goes through the narrow /api/cron/ai-import-{claim,status,result}
 * endpoints on Vercel, which are the only holders of the service-role key.
 *
 * Run: tsx scripts/process-ai-import-queue.ts
 */
import { processWorkbook } from '@/lib/trade/ai-import/process'
import {
  RowCapExceededError,
  EmptyWorkbookError,
} from '@/lib/trade/ai-import/sample-workbook'

const MAX_JOBS_PER_RUN = 5

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`[worker] missing required env: ${name}`)
    process.exit(1)
  }
  return v
}

const SITE_URL = requireEnv('SITE_URL').replace(/\/$/, '')
const CRON_SECRET = requireEnv('CRON_SECRET')
requireEnv('GEMINI_API_KEY') // consumed inside processWorkbook's default Gemini caller

const authHeaders = {
  Authorization: `Bearer ${CRON_SECRET}`,
  'Content-Type': 'application/json',
}

interface ClaimedJob {
  id: string
  userId: string
  storagePath: string
  sourceTimezone: string
  originalFilename: string
}

async function claim(): Promise<{ job: ClaimedJob | null; signedDownloadUrl?: string }> {
  const res = await fetch(`${SITE_URL}/api/cron/ai-import-claim`, {
    method: 'POST',
    headers: authHeaders,
  })
  if (!res.ok) throw new Error(`claim failed: HTTP ${res.status}`)
  return res.json()
}

async function postStatus(jobId: string): Promise<void> {
  const res = await fetch(`${SITE_URL}/api/cron/ai-import-status`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ jobId, status: 'AI_MAPPING' }),
  })
  if (!res.ok) throw new Error(`status update failed: HTTP ${res.status}`)
}

async function postResult(payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SITE_URL}/api/cron/ai-import-result`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    console.error(`[worker] result post failed: HTTP ${res.status}`)
  }
}

function errToMessage(err: unknown): string {
  if (err instanceof RowCapExceededError) return 'row_cap_exceeded'
  if (err instanceof EmptyWorkbookError) return 'empty_workbook'
  const msg = err instanceof Error ? err.message : String(err)
  return msg.slice(0, 500)
}

async function processOne(job: ClaimedJob, signedDownloadUrl: string): Promise<void> {
  try {
    const fileRes = await fetch(signedDownloadUrl)
    if (!fileRes.ok) throw new Error(`download failed: HTTP ${fileRes.status}`)
    const buffer = await fileRes.arrayBuffer()

    await postStatus(job.id)

    const result = await processWorkbook(buffer, job.sourceTimezone)

    await postResult({
      jobId: job.id,
      status: 'AWAITING_CONFIRMATION',
      aiMapping: result.aiMapping,
      extractedLegs: result.extractedLegs,
      parseErrors: result.parseErrors,
      rowCountRaw: result.rowCountRaw,
    })
    console.log(
      `[worker] job ${job.id}: mode=${result.aiMapping.mode} legs=${result.extractedLegs.length} errors=${result.parseErrors.length}`,
    )
  } catch (err) {
    const errorMessage = errToMessage(err)
    console.error(`[worker] job ${job.id} failed: ${errorMessage}`)
    await postResult({ jobId: job.id, status: 'FAILED', errorMessage })
  }
}

async function main(): Promise<void> {
  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const { job, signedDownloadUrl } = await claim()
    if (!job || !signedDownloadUrl) {
      console.log('[worker] queue empty')
      break
    }
    await processOne(job, signedDownloadUrl)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[worker] fatal:', err)
    process.exit(1)
  })
