import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseExcelBuffer, generateTemplate } from '@/lib/trade/excel-import'

// GET /api/trades/import?template=true  → download blank template
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('template') !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const buf = generateTemplate()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="trade-import-template.xlsx"',
    },
  })
}

// POST /api/trades/import  (multipart/form-data, field: file, optional: previewOnly=true)
export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const buffer = await (file as File).arrayBuffer()
  const { legs, errors: parseErrors } = parseExcelBuffer(buffer)

  if (legs.length === 0) {
    return NextResponse.json(
      { error: parseErrors[0] ?? 'No valid rows found', warnings: parseErrors },
      { status: 422 }
    )
  }

  const previewOnly = formData.get('previewOnly') === 'true'
  if (previewOnly) {
    return NextResponse.json({ legs, warnings: parseErrors })
  }

  // Full import — reuse manual route logic inline to avoid circular imports
  const { buildExecutions } = await import('@/lib/trade/manual-entry')
  const { processExecutions } = await import('@/lib/ibkr/process-executions')

  const { executions, errors: validationErrors } = buildExecutions(legs)

  if (validationErrors.length > 0 && executions.length === 0) {
    return NextResponse.json(
      { error: 'Validation failed', details: validationErrors },
      { status: 422 }
    )
  }

  const results = await processExecutions(executions, user.id)

  const processed = results.filter(r => r.status === 'PROCESSED').length
  const skipped   = results.filter(r => r.status === 'SKIPPED_DUPLICATE').length
  const failed    = results.filter(r => r.status === 'FAILED').length
  const errMsgs   = results.filter(r => r.status === 'FAILED').map(r => `${r.brokerExecId}: ${r.error}`)

  return NextResponse.json({
    processed,
    skipped,
    failed,
    errors: [...parseErrors, ...errMsgs],
  })
}
