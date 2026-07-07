import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function setSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()')
  response.headers.set(
    'Content-Security-Policy-Report-Only',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://*.ingest.de.sentry.io https://*.ingest.sentry.io; frame-ancestors 'none'"
  )
  return response
}

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
  const isLandingPage  = pathname === '/'
  const isPublicPage   = pathname === '/terms' || pathname === '/privacy'
  const isBillingWebhook = pathname === '/api/billing/webhook'
  const isOgImage      = pathname === '/og'

  // Unauthenticated: allow landing, login, signup, password-reset, public pages, billing webhook, and OG image
  if (!user && !isLandingPage && !isLoginPage && !isSignupPage && !isAuthCallback && !isForgotPwd && !isResetPwd && !isPublicPage && !isBillingWebhook && !isOgImage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return setSecurityHeaders(NextResponse.redirect(url))
  }

  // Authenticated on login: redirect to app
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/research'
    return setSecurityHeaders(NextResponse.redirect(url))
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
      return setSecurityHeaders(NextResponse.redirect(url))
    }
  }

  return setSecurityHeaders(supabaseResponse)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mov|m4v)$).*)'],
}
