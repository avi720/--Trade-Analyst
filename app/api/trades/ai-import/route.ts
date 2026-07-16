import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { getUserTier, isProTier, proRequiredResponse } from '@/lib/billing/tier'
import { fireWorkerDispatch } from '@/lib/trade/ai-import/dispatch-worker'

export const maxDuration = 60

const AI_IMPORT_BUCKET = 'ai-imports'
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB — larger than the fixed-format importer to fit personal layouts
const MAX_ACTIVE_JOBS = 3
const ACTIVE_STATUSES = ['PENDING', 'PARSING', 'AI_MAPPING', 'AWAITING_CONFIRMATION']
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',
])

function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// GET /api/trades/ai-import → the user's recent AI-import jobs (for the panel).
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('ExcelImportJob')
    .select(
      'id, status, originalFilename, fileSize, sourceTimezone, rowCountRaw, aiMapping, parseErrors, importSummary, errorMessage, createdAt, updatedAt, completedAt',
    )
    .order('createdAt', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  return NextResponse.json({ jobs: data ?? [] })
}

// POST /api/trades/ai-import  (multipart/form-data: file=.xlsx, timezone=IANA)
// Creates a PENDING job + stores the file. The GitHub-runner worker picks it up.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tier } = await getUserTier(user.id)
  if (!isProTier(tier)) {
    return proRequiredResponse('ai_excel_import')
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  const timezone = String(formData.get('timezone') ?? '')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }
  if (!isValidTimeZone(timezone)) {
    return NextResponse.json({ error: 'אזור זמן לא תקין' }, { status: 400 })
  }

  const f = file as File
  if (f.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `הקובץ גדול מדי — עד ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    )
  }
  if (f.type && !ALLOWED_MIME_TYPES.has(f.type)) {
    return NextResponse.json(
      { error: 'סוג קובץ לא נתמך — רק .xlsx' },
      { status: 415 },
    )
  }

  // Cap concurrent in-flight jobs per user.
  const { count } = await supabase
    .from('ExcelImportJob')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_STATUSES)
  if ((count ?? 0) >= MAX_ACTIVE_JOBS) {
    return NextResponse.json(
      { error: `יש כבר ${MAX_ACTIVE_JOBS} ייבוא AI פעילים. סיים או בטל אחד לפני העלאה נוספת.` },
      { status: 429 },
    )
  }

  const jobId = randomUUID()
  const storagePath = `${user.id}/${jobId}.xlsx`
  const buffer = await f.arrayBuffer()

  // Upload via the user-scoped client — storage RLS confines writes to the
  // user's own <userId>/ prefix. No service-role key on this path.
  const { error: uploadError } = await supabase.storage
    .from(AI_IMPORT_BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })
  if (uploadError) {
    return NextResponse.json({ error: 'שמירת הקובץ נכשלה' }, { status: 500 })
  }

  const { error: insertError } = await supabase.from('ExcelImportJob').insert({
    id: jobId,
    userId: user.id,
    status: 'PENDING',
    storagePath,
    originalFilename: f.name || 'upload.xlsx',
    fileSize: f.size,
    sourceTimezone: timezone,
  })
  if (insertError) {
    // Roll back the orphaned upload so a retry gets a clean slate.
    await supabase.storage.from(AI_IMPORT_BUCKET).remove([storagePath])
    return NextResponse.json({ error: 'יצירת המשימה נכשלה' }, { status: 500 })
  }

  // Best-effort: wake the worker now. No-ops (→ cron fallback) if unconfigured.
  await fireWorkerDispatch()

  return NextResponse.json({ jobId, status: 'PENDING' }, { status: 202 })
}
