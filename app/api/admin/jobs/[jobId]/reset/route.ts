import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  adminAuthErrorResponse,
} from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

const uuidSchema = z.string().uuid()

// POST /api/admin/jobs/[jobId]/reset — resets an ExcelImportJob back to
// PENDING so the next worker drain (repository_dispatch or */30 schedule)
// re-claims it via claim_excel_import_job(). Clears errorMessage. Does NOT
// re-fire repository_dispatch — the app has no GitHub PAT.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    await requireAdmin()
  } catch (err) {
    const resp = adminAuthErrorResponse(err)
    if (resp) return resp
    throw err
  }

  const { jobId } = await params
  if (!uuidSchema.safeParse(jobId).success) {
    return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: existing, error: readError } = await admin
    .from('ExcelImportJob')
    .select('id')
    .eq('id', jobId)
    .maybeSingle()

  if (readError) {
    console.error('[admin/jobs/reset] read failed:', readError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { error: updateError } = await admin
    .from('ExcelImportJob')
    .update({
      status: 'PENDING',
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (updateError) {
    console.error('[admin/jobs/reset] update failed:', updateError.message)
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
  }

  return NextResponse.json({ id: jobId, status: 'PENDING' })
}
