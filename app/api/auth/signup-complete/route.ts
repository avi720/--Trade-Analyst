import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/db/types'
import { z } from 'zod'

const schema = z.object({
  firstName:      z.string().min(1, 'שם פרטי הוא שדה חובה'),
  lastName:       z.string().min(1, 'שם משפחה הוא שדה חובה'),
  phone:          z.string().min(1, 'טלפון הוא שדה חובה'),
  addressCountry: z.string().min(1, 'מדינה היא שדה חובה'),
  addressCity:    z.string().optional(),
  addressStreet:  z.string().optional(),
  display: z.object({
    currency:     z.enum(['USD', 'ILS']),
    dateFormat:   z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
    numberFormat: z.enum(['en', 'eu']),
  }),
})

export async function POST(req: NextRequest) {
  const cookieStore = cookies()
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'נתונים לא תקינים', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { firstName, lastName, phone, addressCountry, addressCity, addressStreet, display } = parsed.data

  const admin = createAdminClient()

  // Read existing settings to preserve any other top-level keys
  const { data: existing } = await admin
    .from('User')
    .select('settings')
    .eq('id', user.id)
    .maybeSingle()

  const existingSettings = (existing?.settings as Record<string, unknown>) ?? {}
  const mergedSettings = { ...existingSettings, display }

  const { error } = await admin.from('User').upsert(
    {
      id:             user.id,
      email:          user.email!,
      firstName,
      lastName,
      name:           `${firstName} ${lastName}`.trim(),
      phone,
      addressCountry,
      addressCity:    addressCity ?? null,
      addressStreet:  addressStreet ?? null,
      settings:       mergedSettings,
    },
    { onConflict: 'id' }
  )

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשמירת הפרטים' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
