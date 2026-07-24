import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/utils'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/research'
  const next = rawNext.startsWith('/') ? rawNext : '/research'
  const base = getBaseUrl()

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${base}${next}`)
    }
    // Exchange failed (most commonly: the email link was opened in a different
    // browser than the one that started signup, so the PKCE `code_verifier`
    // cookie is not present here). Supabase's /auth/v1/verify already marked
    // `email_confirmed_at` server-side before redirecting here — the email IS
    // verified, we just could not create a session in THIS browser. Send the
    // user to the verified page (which tells them to return to the original
    // tab) instead of the login page with a scary error.
    return NextResponse.redirect(`${base}/signup/verified`)
  }

  // No `code` at all — either a malformed callback or a bot. Not a
  // verification event, so the "verified" copy would be a lie. Keep the login
  // fallback for this case.
  return NextResponse.redirect(`${base}/login?error=auth_callback_failed`)
}
