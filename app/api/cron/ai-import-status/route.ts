import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/auth/cron-secret'

export const maxDuration = 30

// Only the PARSING → AI_MAPPING intermediate transition is permitted here.
const bodySchema = z.object({
  jobId: z.string().uuid(),
  status: z.literal('AI_MAPPING'),
})

// POST /api/cron/ai-import-status  (Bearer CRON_SECRET)
// Worker reports it has started the AI mapping phase.
export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get('Authorization'))) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let jobId: string
  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 422 })
    }
    jobId = parsed.data.jobId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ExcelImportJob')
    .update({ status: 'AI_MAPPING' })
    .eq('id', jobId)
    .eq('status', 'PARSING')
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not in PARSING state' }, { status: 409 })

  return NextResponse.json({ ok: true })
}
