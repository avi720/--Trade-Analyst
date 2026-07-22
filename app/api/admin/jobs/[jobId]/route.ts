import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  adminAuthErrorResponse,
} from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

const AI_IMPORT_BUCKET = 'ai-imports'
const uuidSchema = z.string().uuid()

// GET /api/admin/jobs/[jobId] — returns the full job payload including
// aiMapping / extractedLegs / parseErrors JSON blobs. Used by the detail modal.
export async function GET(
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

  const { data: job, error } = await admin
    .from('ExcelImportJob')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (error) {
    console.error('[admin/jobs GET one] failed:', error.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Join owner email.
  const { data: owner } = await admin
    .from('User')
    .select('email')
    .eq('id', job.userId)
    .maybeSingle()

  return NextResponse.json({ ...job, userEmail: owner?.email ?? null })
}

// DELETE /api/admin/jobs/[jobId] — removes the xlsx from storage
// (best-effort log-and-continue) then deletes the DB row. Returns 204.
export async function DELETE(
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
    .select('id, storagePath')
    .eq('id', jobId)
    .maybeSingle()

  if (readError) {
    console.error('[admin/jobs DELETE] read failed:', readError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (existing.storagePath) {
    const { error: storageError } = await admin.storage
      .from(AI_IMPORT_BUCKET)
      .remove([existing.storagePath])
    if (storageError) {
      // Log-and-continue — orphan storage is a small leak; failing the
      // whole delete because storage said "not found" would be worse.
      console.warn(
        '[admin/jobs DELETE] storage remove failed:',
        existing.storagePath,
        storageError.message,
      )
    }
  }

  const { error: deleteError } = await admin
    .from('ExcelImportJob')
    .delete()
    .eq('id', jobId)

  if (deleteError) {
    console.error('[admin/jobs DELETE] db delete failed:', deleteError.message)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
