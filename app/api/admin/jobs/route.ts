import { NextResponse } from 'next/server'
import {
  requireAdmin,
  adminAuthErrorResponse,
} from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/admin/jobs — used by the admin jobs table to poll for updates
// while non-terminal rows exist. Same shape as the page's SSR fetch.
export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    const resp = adminAuthErrorResponse(err)
    if (resp) return resp
    throw err
  }

  const admin = createAdminClient()

  const { data: jobs, error: jobsErr } = await admin
    .from('ExcelImportJob')
    .select(
      'id, userId, status, originalFilename, fileSize, sourceTimezone, rowCountRaw, errorMessage, createdAt, updatedAt, completedAt',
    )
    .order('createdAt', { ascending: false })
    .limit(200)

  if (jobsErr) {
    console.error('[admin/jobs GET] failed:', jobsErr.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const userIds = Array.from(new Set((jobs ?? []).map(j => j.userId)))
  const emailByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('User')
      .select('id, email')
      .in('id', userIds)
    for (const u of users ?? []) emailByUserId.set(u.id, u.email)
  }

  const rows = (jobs ?? []).map(j => ({
    id: j.id,
    userId: j.userId,
    userEmail: emailByUserId.get(j.userId) ?? '—',
    status: j.status,
    originalFilename: j.originalFilename,
    fileSize: j.fileSize,
    sourceTimezone: j.sourceTimezone,
    rowCountRaw: j.rowCountRaw,
    errorMessage: j.errorMessage,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    completedAt: j.completedAt,
  }))

  return NextResponse.json({ jobs: rows })
}
