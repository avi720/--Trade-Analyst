import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/auth/cron-secret'
import { syncActiveConnections } from '@/lib/ibkr/sync-pipeline'

export const maxDuration = 60

// Secured with CRON_SECRET header — called by GitHub Actions at 13:00 & 20:00 UTC daily.
// The per-connection sync logic lives in lib/ibkr/sync-pipeline.ts and is
// shared with the on-demand admin trigger.
export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get('Authorization'))) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()

  let results
  try {
    results = await syncActiveConnections(admin)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cron/ibkr-sync] pipeline failed:', msg)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (results.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: 'No active connections',
      processed: 0,
    })
  }

  const success = results.filter(r => r.status === 'SUCCESS').length
  const errored = results.filter(r => r.status === 'ERROR').length
  const transient = results.filter(r => r.status === 'TRANSIENT_ERROR').length

  return NextResponse.json({
    ok: errored === 0,
    total: results.length,
    success,
    errored,
    transient,
    results,
  })
}
