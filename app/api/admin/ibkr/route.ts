import { NextResponse } from 'next/server'
import {
  requireAdmin,
  adminAuthErrorResponse,
} from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/admin/ibkr — used by the admin IBKR table to poll updates
// while a sync is in flight.
export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    const resp = adminAuthErrorResponse(err)
    if (resp) return resp
    throw err
  }

  const admin = createAdminClient()

  const { data: conns, error: connsErr } = await admin
    .from('BrokerConnection')
    .select(
      'id, userId, brokerName, accountId, isActive, lastSyncAt, lastSyncStatus, lastSyncError',
    )
    .order('lastSyncAt', { ascending: false, nullsFirst: false })

  if (connsErr) {
    console.error('[admin/ibkr GET] failed:', connsErr.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const userIds = Array.from(new Set((conns ?? []).map(c => c.userId)))
  const emailByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('User')
      .select('id, email')
      .in('id', userIds)
    for (const u of users ?? []) emailByUserId.set(u.id, u.email)
  }

  const connections = (conns ?? []).map(c => ({
    id: c.id,
    userId: c.userId,
    userEmail: emailByUserId.get(c.userId) ?? '—',
    brokerName: c.brokerName,
    accountId: c.accountId,
    isActive: c.isActive,
    lastSyncAt: c.lastSyncAt,
    lastSyncStatus: c.lastSyncStatus,
    lastSyncError: c.lastSyncError,
  }))

  return NextResponse.json({ connections })
}
