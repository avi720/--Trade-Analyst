import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const AI_IMPORT_BUCKET = 'ai-imports'

// GET /api/trades/ai-import/[jobId] → status + payload for polling / preview.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // RLS confines this to the caller's own jobs.
  const { data, error } = await supabase
    .from('ExcelImportJob')
    .select(
      'id, status, originalFilename, sourceTimezone, rowCountRaw, aiMapping, extractedLegs, parseErrors, importSummary, errorMessage, createdAt, updatedAt, completedAt',
    )
    .eq('id', jobId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}

// DELETE /api/trades/ai-import/[jobId] → cancel a job + remove its stored file.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: job, error } = await supabase
    .from('ExcelImportJob')
    .select('id, status, storagePath')
    .eq('id', jobId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (job.status === 'COMPLETED') {
    return NextResponse.json(
      { error: 'לא ניתן לבטל ייבוא שכבר הושלם' },
      { status: 409 },
    )
  }

  await supabase
    .from('ExcelImportJob')
    .update({ status: 'CANCELLED' })
    .eq('id', jobId)

  await supabase.storage.from(AI_IMPORT_BUCKET).remove([job.storagePath])

  return NextResponse.json({ ok: true, status: 'CANCELLED' })
}
