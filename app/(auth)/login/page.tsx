'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TradeLogoIcon } from '@/components/trade-logo'
import { GoogleSignInButton } from '@/components/google-signin-button'
import { trackEvent } from '@/lib/analytics/posthog'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const reportedRedirectError = useRef(false)

  // Report arrivals at /login?error=… — this is where /auth/callback dumps users when it
  // gets no `code`, and until now that landing was completely untracked.
  //
  // Read from window.location rather than useSearchParams(): the latter would force this
  // page behind a Suspense boundary at build time for a value only needed after mount.
  useEffect(() => {
    if (reportedRedirectError.current) return
    const reason = new URLSearchParams(window.location.search).get('error')
    if (!reason) return
    reportedRedirectError.current = true
    trackEvent('login_failed', { reason })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Lazy import — avoids SSR evaluation of Supabase client
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('אימייל או סיסמה שגויים')
      setLoading(false)
      // No email / password in the payload — a failure count is the signal, the credentials
      // are not, and PostHog is not the place for either.
      trackEvent('login_failed', { reason: 'invalid_credentials' })
      return
    }

    router.push('/research')
    router.refresh()
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-dark">
      <div className="panel p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <TradeLogoIcon size={56} />
          </div>
          <h1 className="text-2xl font-bold text-text-main font-mono">
            Trade Analyst
          </h1>
          <p className="text-text-dim text-sm mt-1">יומן מסחר חכם</p>
        </div>

        <GoogleSignInButton label="התחבר עם Google" />

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-text-dim text-sm">או</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-text-dim mb-1">אימייל</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-base w-full px-3 py-2 text-base"
              placeholder="your@email.com"
              autoComplete="email"
              required
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-text-dim mb-1">סיסמה</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-base w-full px-3 py-2 text-base"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              dir="ltr"
            />
          </div>

          {error && (
            <p className="text-red text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-amber text-black font-semibold rounded-md hover:bg-amber-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>

        <p className="text-center text-sm text-text-dim mt-4">
          <Link href="/forgot-password" className="text-text-dim hover:text-amber hover:underline">
            שכחתי סיסמה
          </Link>
        </p>

        <p className="text-center text-sm text-text-dim mt-6">
          עדיין אין לך חשבון?{' '}
          <Link href="/signup" className="text-amber hover:underline">
            הירשם כאן
          </Link>
        </p>
      </div>
    </div>
  )
}
