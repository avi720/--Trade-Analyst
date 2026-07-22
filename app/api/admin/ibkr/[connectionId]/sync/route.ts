import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { z } from 'zod'
import {
  requireAdmin,
  adminAuthErrorResponse,
} from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncOneConnection } from '@/lib/ibkr/sync-pipeline'

export const maxDuration = 60

const uuidSchema = z.string().uuid()

// POST /api/admin/ibkr/[connectionId]/sync — kicks off the same
// syncOneConnection() the cron uses, for a single connection, asynchronously.
// Returns 202 immediately; the pipeline writes lastSyncAt / lastSyncStatus /
// lastSyncError on completion (or transient failure). The UI polls
// GET /api/admin/ibkr to observe the status transition.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    await requireAdmin()
  } catch (err) {
    const resp = adminAuthErrorResponse(err)
    if (resp) return resp
    throw err
  }

  const { connectionId } = await params
  if (!uuidSchema.safeParse(connectionId).success) {
    return NextResponse.json({ error: 'Invalid connectionId' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: conn, error: readError } = await admin
    .from('BrokerConnection')
    .select('id, userId, flexTokenEncrypted, flexQueryIdActivity, isActive')
    .eq('id', connectionId)
    .maybeSingle()

  if (readError) {
    console.error('[admin/ibkr/sync] read failed:', readError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  if (!conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }
  if (!conn.isActive) {
    return NextResponse.json({ error: 'Connection is inactive' }, { status: 409 })
  }

  // Fire-and-forget through waitUntil so the response resolves within a
  // second while the sync runs on the serverless background.
  waitUntil(
    syncOneConnection(admin, {
      id: conn.id,
      userId: conn.userId,
      flexTokenEncrypted: conn.flexTokenEncrypted,
      flexQueryIdActivity: conn.flexQueryIdActivity,
    }).catch(err => {
      // syncOneConnection is designed to swallow known errors and update
      // lastSyncStatus. Unexpected throws are logged only.
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[admin/ibkr/sync] unexpected error:', msg)
    }),
  )

  return NextResponse.json(
    { ok: true, connectionId, note: 'sync started' },
    { status: 202 },
  )
}
