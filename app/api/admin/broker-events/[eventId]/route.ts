import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  adminAuthErrorResponse,
} from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

const uuidSchema = z.string().uuid()

// GET /api/admin/broker-events/[eventId] — full BrokerEvent payload for
// the detail modal. Includes rawPayload (JSON blob; for IBKR_FLEX events
// this is `{ xml: string }` capped to 10000 chars in the sync pipeline).
// Read-only. No reprocess endpoint (feature dropped in the Phase 3 plan).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    await requireAdmin()
  } catch (err) {
    const resp = adminAuthErrorResponse(err)
    if (resp) return resp
    throw err
  }

  const { eventId } = await params
  if (!uuidSchema.safeParse(eventId).success) {
    return NextResponse.json({ error: 'Invalid eventId' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: event, error } = await admin
    .from('BrokerEvent')
    .select('*')
    .eq('id', eventId)
    .maybeSingle()

  if (error) {
    console.error('[admin/broker-events GET] failed:', error.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const { data: owner } = await admin
    .from('User')
    .select('email')
    .eq('id', event.userId)
    .maybeSingle()

  return NextResponse.json({ ...event, userEmail: owner?.email ?? null })
}
