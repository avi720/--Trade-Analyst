import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/auth/cron-secret'

export const maxDuration = 30

const STUCK_AFTER_MINUTES = 15

// POST /api/cron/ai-import-watchdog  (Bearer CRON_SECRET)
// Fails jobs wedged in an in-flight state (worker crash / lost run) so they don't
// hang forever. A self-correcting safety net — runs every 15 min.
export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get('Authorization'))) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000).toISOString()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ExcelImportJob')
    .update({ status: 'FAILED', errorMessage: 'timeout_watchdog' })
    .in('status', ['PARSING', 'AI_MAPPING', 'IMPORTING'])
    .lt('updatedAt', cutoff)
    .select('id')

  if (error) {
    console.error('[cron/ai-import-watchdog] DB error:', error.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const failed = data?.length ?? 0
  if (failed > 0) {
    console.warn(`[cron/ai-import-watchdog] force-failed ${failed} stuck job(s)`) // recovery, not an error
  }
  return NextResponse.json({ ok: true, failed })
}
