'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const origin = window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    })

    setLoading(false)
    if (error) {
      setError('שגיאה בשליחת המייל. אנא נסה שוב.')
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-dark">
      <div className="panel p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-main font-mono">שכחתי סיסמה</h1>
          <p className="text-text-dim text-sm mt-2">
            הזן את כתובת המייל שלך ונשלח לך קישור לאיפוס הסיסמה
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm text-text-dim mb-1">
                אימייל
              </label>
              <input
                id="forgot-email"
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

            {error && <p className="text-red text-sm text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-amber text-black font-semibold rounded-md hover:bg-amber-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'שולח...' : 'שלח קישור איפוס'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="border border-amber/30 bg-amber-tint rounded-md p-5">
              <p className="text-amber font-semibold text-sm mb-2">המייל נשלח</p>
              <p className="text-text-main text-sm leading-relaxed">
                שלחנו קישור איפוס לכתובת <span className="font-mono">{email}</span>.
                לחץ עליו כדי לבחור סיסמה חדשה.
              </p>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-text-dim mt-6">
          <Link href="/login" className="text-amber hover:underline">
            חזרה לכניסה
          </Link>
        </p>
      </div>
    </div>
  )
}
