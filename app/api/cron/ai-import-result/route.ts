import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/auth/cron-secret'
import type { TablesUpdate, Json } from '@/lib/db/types'

export const maxDuration = 30

const legErrorSchema = z.object({ rowIndex: z.number().int(), reason: z.string() })

const successSchema = z.object({
  jobId: z.string().uuid(),
  status: z.literal('AWAITING_CONFIRMATION'),
  aiMapping: z.record(z.string(), z.unknown()),
  extractedLegs: z.array(z.record(z.string(), z.unknown())),
  parseErrors: z.array(legErrorSchema),
  rowCountRaw: z.number().int().min(0),
})

const failSchema = z.object({
  jobId: z.string().uuid(),
  status: z.literal('FAILED'),
  errorMessage: z.string().max(2000),
})

const bodySchema = z.discriminatedUnion('status', [successSchema, failSchema])

// POST /api/cron/ai-import-result  (Bearer CRON_SECRET)
// Worker writes the final result of the AI phase: either the extracted preview
// (→ AWAITING_CONFIRMATION) or a failure (→ FAILED). Only an in-flight job
// (PARSING/AI_MAPPING) may be transitioned.
export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get('Authorization'))) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 422 },
      )
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const update: TablesUpdate<'ExcelImportJob'> =
    body.status === 'AWAITING_CONFIRMATION'
      ? {
          status: 'AWAITING_CONFIRMATION',
          aiMapping: body.aiMapping as Json,
          extractedLegs: body.extractedLegs as Json,
          parseErrors: body.parseErrors as unknown as Json,
          rowCountRaw: body.rowCountRaw,
        }
      : { status: 'FAILED', errorMessage: body.errorMessage }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ExcelImportJob')
    .update(update)
    .eq('id', body.jobId)
    .in('status', ['PARSING', 'AI_MAPPING'])
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  if (!data) {
    return NextResponse.json({ error: 'Job not in an in-flight state' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
