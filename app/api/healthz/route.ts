import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type HealthStatus = 'ok' | 'fail'

interface HealthResponse {
  db: HealthStatus
  env: HealthStatus
}

export async function GET() {
  let dbStatus: HealthStatus = 'fail'
  let envStatus: HealthStatus = 'fail'

  try {
    const key = process.env.FLEX_TOKEN_ENCRYPTION_KEY
    if (typeof key === 'string' && /^[0-9a-f]{64}$/i.test(key)) {
      envStatus = 'ok'
    }
  } catch {
    envStatus = 'fail'
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('User').select('id', { count: 'exact', head: true }).limit(1)
    if (!error) dbStatus = 'ok'
  } catch {
    dbStatus = 'fail'
  }

  const body: HealthResponse = { db: dbStatus, env: envStatus }
  const status = dbStatus === 'ok' && envStatus === 'ok' ? 200 : 503

  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'public, max-age=10, s-maxage=10' },
  })
}
