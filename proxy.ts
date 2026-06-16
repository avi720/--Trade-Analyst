import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isLoginPage    = pathname === '/login'
  const isSignupPage   = pathname === '/signup' || pathname.startsWith('/signup/')
  const isAuthCallback = pathname.startsWith('/auth/')
  const isForgotPwd    = pathname === '/forgot-password'
  const isResetPwd     = pathname === '/reset-password'

  // Unauthenticated: allow login, signup, and password-reset pages
  if (!user && !isLoginPage && !isSignupPage && !isAuthCallback && !isForgotPwd && !isResetPwd) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated on login: redirect to app
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/research'
    return NextResponse.redirect(url)
  }

  // Authenticated on signup: allow only if profile is incomplete (firstName not set)
  if (user && isSignupPage) {
    const { data: profile } = await supabase
      .from('User')
      .select('firstName')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.firstName) {
      const url = request.nextUrl.clone()
      url.pathname = '/research'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
