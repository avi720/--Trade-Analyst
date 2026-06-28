import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  getLemonSqueezyConfig,
  createCheckoutSession,
  type BillingPlan,
} from '@/lib/billing/lemon-squeezy'
import { getBaseUrl } from '@/lib/utils'

const schema = z.object({
  plan: z.enum(['monthly', 'annual']),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = getLemonSqueezyConfig()
  if (!config) {
    return NextResponse.json(
      { error: 'התשלומים עדיין לא הופעלו. נסה שוב מאוחר יותר.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const plan: BillingPlan = parsed.data.plan
  const successUrl = `${getBaseUrl()}/profile?tab=billing&checkout=success`

  try {
    const { url } = await createCheckoutSession(config, {
      plan,
      userId: user.id,
      userEmail: user.email ?? '',
      successUrl,
    })
    return NextResponse.json({ url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[billing/checkout] failed:', msg)
    return NextResponse.json(
      { error: 'יצירת מנוי נכשלה. נסה שוב או צור קשר עם התמיכה.' },
      { status: 500 },
    )
  }
}
