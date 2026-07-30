import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  evaluateGeoAccess,
  geoBlockedHtml,
  isBypassGrant,
  GEO_BYPASS_COOKIE,
  GEO_BYPASS_MAX_AGE,
} from '@/lib/geo/gate'

// Public marketing/legal pages reachable without a session. Feature landing
// pages (/ibkr-sync etc.) live here too — omitting a new public route sends
// anonymous visitors to /login, which defeats the SEO purpose of the page.
const PUBLIC_PATHS = new Set([
  '/terms',
  '/privacy',
  '/pricing',
  '/ibkr-sync',
  '/fifo-analytics',
  '/ai-trading-assistant',
])

function setSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()')
  // TODO(post-launch, X4 in docs/in-progress/SECURITY-AUDIT-LAUNCH.md): re-enable
  // CSP once we have someone to triage violation reports. Report-only mode with
  // no report-to endpoint just emits noise; deleted per owner decision 2026-07-07.
  // The directive list is preserved here as a starting point when it comes back —
  // switch to `Content-Security-Policy` (enforcing) and add `report-to` pointing
  // at a `/api/csp-report` handler that forwards to Sentry.
  // response.headers.set(
  //   'Content-Security-Policy-Report-Only',
  //   "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://*.ingest.de.sentry.io https://*.ingest.sentry.io; frame-ancestors 'none'"
  // )
  return response
}

// 451 Unavailable For Legal Reasons — semantically right for a jurisdiction block, and
// distinguishable in logs from a 403 auth failure. JSON for /api/*, an HTML page otherwise.
function geoBlockedResponse(pathname: string): NextResponse {
  if (pathname.startsWith('/api/')) {
    return setSecurityHeaders(
      NextResponse.json({ error: 'השירות אינו זמין באזורך' }, { status: 451 })
    )
  }
  return setSecurityHeaders(
    new NextResponse(geoBlockedHtml(), {
      status: 451,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  )
}

export async function proxy(request: NextRequest) {
  // ── Geo gate ──────────────────────────────────────────────────────────────
  // Runs before the Supabase client is built: a rejected request should not cost a
  // getUser() round-trip. Inert until GEO_GATE_ENABLED=true.

  // `?geo_bypass=<secret>` mints the bypass cookie, then redirects to the same URL without
  // the param — keeping the secret out of browser history, the Referer header and access
  // logs. Handled before evaluateGeoAccess so the grant works on a blocked path.
  if (isBypassGrant(request.nextUrl.searchParams, process.env)) {
    const clean = request.nextUrl.clone()
    clean.searchParams.delete('geo_bypass')
    const response = setSecurityHeaders(NextResponse.redirect(clean))
    response.cookies.set(GEO_BYPASS_COOKIE, process.env.GEO_BYPASS_SECRET!, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: GEO_BYPASS_MAX_AGE,
    })
    return response
  }

  const geo = evaluateGeoAccess(
    {
      pathname: request.nextUrl.pathname,
      headers: request.headers,
      bypassCookie: request.cookies.get(GEO_BYPASS_COOKIE)?.value,
    },
    process.env
  )

  if (!geo.allowed) {
    return geoBlockedResponse(request.nextUrl.pathname)
  }

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
  const isPublicPage   = PUBLIC_PATHS.has(pathname)
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
