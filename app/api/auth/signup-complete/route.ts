import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimitedResponse } from '@/lib/auth/rate-limit'
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 10 attempts per hour per user.
  const rl = await checkRateLimit(`user:${user.id}:signup-complete`, 10, 3600)
  if (!rl.ok) return rateLimitedResponse(rl)

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'נתונים לא תקינים', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { firstName, lastName, phone, addressCountry, addressCity, addressStreet, display } = parsed.data

  // Read existing settings to preserve any other top-level keys (RLS: own row).
  const { data: existing } = await supabase
    .from('User')
    .select('settings')
    .eq('id', user.id)
    .maybeSingle()

  const existingSettings = (existing?.settings as Record<string, unknown>) ?? {}
  const mergedSettings = { ...existingSettings, display }

  // Mutable profile columns only. NEVER include `id` or `email` here: the
  // `authenticated` role has column-level UPDATE grants on the profile columns
  // but NOT on `id`/`email` (migration `harden_user_billing_write_paths`). A
  // `.upsert()` that carries `email` would emit `ON CONFLICT DO UPDATE SET
  // email=...` and fail with 42501 whenever the row already exists — which it
  // usually does, because the dashboard layout lazily inserts it first.
  const profile = {
    firstName,
    lastName,
    name:           `${firstName} ${lastName}`.trim(),
    phone,
    addressCountry,
    addressCity:    addressCity ?? null,
    addressStreet:  addressStreet ?? null,
    settings:       mergedSettings,
  }

  // Update-first: the row almost always exists (layout created it). `email`/`id`
  // are already correct from that insert / from auth, so they are not touched.
  const { data: updated, error: updateError } = await supabase
    .from('User')
    .update(profile)
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (updateError) {
    console.error('[signup-complete] User update failed:', {
      code: updateError.code,
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
      userId: user.id,
    })
    return NextResponse.json({ error: 'שגיאה בשמירת הפרטים' }, { status: 500 })
  }

  // No row yet (e.g. auto-confirm path that never hit the dashboard layout) —
  // insert it. `email`/`id` are allowed on the INSERT path.
  if (!updated) {
    const { error: insertError } = await supabase.from('User').insert({
      id:    user.id,
      email: user.email!,
      ...profile,
    })
    if (insertError) {
      console.error('[signup-complete] User insert failed:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        userId: user.id,
      })
      return NextResponse.json({ error: 'שגיאה בשמירת הפרטים' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
