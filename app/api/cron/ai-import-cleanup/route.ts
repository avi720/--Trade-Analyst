import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/auth/cron-secret'

export const maxDuration = 30

const RETENTION_DAYS = 7
const AI_IMPORT_BUCKET = 'ai-imports'
const BATCH = 100

// POST /api/cron/ai-import-cleanup  (Bearer CRON_SECRET)
// Removes uploaded xlsx files for terminal jobs older than the retention window.
// The job row (aiMapping + extractedLegs audit trail) is kept; only the raw
// binary is purged. Idempotent — re-removing an already-gone file is a no-op.
export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get('Authorization'))) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ExcelImportJob')
    .select('storagePath')
    .in('status', ['COMPLETED', 'FAILED', 'CANCELLED'])
    .lt('updatedAt', cutoff)
    .limit(BATCH)

  if (error) {
    console.error('[cron/ai-import-cleanup] DB error:', error.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const paths = (data ?? []).map((r) => r.storagePath).filter(Boolean)
  if (paths.length === 0) return NextResponse.json({ ok: true, removed: 0 })

  const { error: rmError } = await admin.storage.from(AI_IMPORT_BUCKET).remove(paths)
  if (rmError) {
    console.error('[cron/ai-import-cleanup] storage remove error:', rmError.message)
    return NextResponse.json({ error: 'Storage error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, removed: paths.length })
}
