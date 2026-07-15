import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { manualLegsSchema, type ManualLeg } from '@/lib/trade/manual-entry'
import { persistManualLegs } from '@/lib/trade/persist-manual-legs'

export const maxDuration = 60

const AI_IMPORT_BUCKET = 'ai-imports'

// POST /api/trades/ai-import/[jobId]/confirm  body: { legs: ManualLeg[] }
// Confirms the (possibly edited) preview legs and runs the real FIFO import.
export async function POST(
  req: NextRequest,
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

  let legs: ManualLeg[]
  try {
    const body = await req.json()
    const parsed = manualLegsSchema.safeParse(body?.legs)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }
    legs = parsed.data as ManualLeg[]
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Atomically claim the job: only a job still AWAITING_CONFIRMATION (and owned
  // by the caller, per RLS) transitions to IMPORTING. Guards double-confirm.
  const { data: claimed, error: claimError } = await supabase
    .from('ExcelImportJob')
    .update({ status: 'IMPORTING' })
    .eq('id', jobId)
    .eq('status', 'AWAITING_CONFIRMATION')
    .select('id, storagePath')
    .maybeSingle()

  if (claimError) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  if (!claimed) {
    return NextResponse.json(
      { error: 'המשימה אינה ממתינה לאישור (ייתכן שכבר יובאה או בוטלה)' },
      { status: 409 },
    )
  }

  const summary = await persistManualLegs(legs, user.id)

  const importSummary = {
    processed: summary.processed,
    skipped: summary.skipped,
    failed: summary.failed,
    errors: summary.errors,
  }

  await supabase
    .from('ExcelImportJob')
    .update({
      status: 'COMPLETED',
      importSummary,
      completedAt: new Date().toISOString(),
    })
    .eq('id', jobId)

  // The raw upload is no longer needed — audit trail lives on the job row
  // (aiMapping + extractedLegs). Best-effort cleanup.
  await supabase.storage.from(AI_IMPORT_BUCKET).remove([claimed.storagePath])

  return NextResponse.json(importSummary)
}
