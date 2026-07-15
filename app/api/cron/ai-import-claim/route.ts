import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/auth/cron-secret'

export const maxDuration = 30

const AI_IMPORT_BUCKET = 'ai-imports'
const SIGNED_URL_TTL_SECONDS = 600 // 10 min — long enough for the worker to download

// POST /api/cron/ai-import-claim  (Bearer CRON_SECRET)
// Atomically claims the oldest PENDING job (→ PARSING) and returns it with a
// short-lived signed download URL. The GitHub-runner worker calls this; it never
// holds the service-role key or Supabase URL itself.
export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get('Authorization'))) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('claim_excel_import_job')
  if (error) {
    console.error('[cron/ai-import-claim] rpc error:', error.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const job = Array.isArray(data) ? data[0] : data
  if (!job) return NextResponse.json({ job: null })

  const { data: signed, error: signErr } = await admin.storage
    .from(AI_IMPORT_BUCKET)
    .createSignedUrl(job.storagePath, SIGNED_URL_TTL_SECONDS)

  if (signErr || !signed) {
    await admin
      .from('ExcelImportJob')
      .update({ status: 'FAILED', errorMessage: 'signed_url_failed' })
      .eq('id', job.id)
    return NextResponse.json({ error: 'Signed URL failed' }, { status: 500 })
  }

  return NextResponse.json({
    job: {
      id: job.id,
      userId: job.userId,
      storagePath: job.storagePath,
      sourceTimezone: job.sourceTimezone,
      originalFilename: job.originalFilename,
    },
    signedDownloadUrl: signed.signedUrl,
  })
}
