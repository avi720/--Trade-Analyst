'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים')
      return
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('הסיסמה חייבת להכיל לפחות אות אחת וספרה אחת')
      return
    }
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות')
      return
    }

    setLoading(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error: updErr } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updErr) {
      setError('שגיאה בעדכון הסיסמה. ייתכן שהקישור פג תוקף — נסה לבקש קישור חדש.')
      return
    }
    setDone(true)
    setTimeout(() => router.push('/research'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-dark">
      <div className="panel p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-main font-mono">איפוס סיסמה</h1>
          <p className="text-text-dim text-sm mt-2">בחר סיסמה חדשה</p>
        </div>

        {!done ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reset-password" className="block text-sm text-text-dim mb-1">
                סיסמה חדשה
              </label>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-base w-full px-3 py-2 text-base"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                aria-describedby="reset-password-hint"
                dir="ltr"
              />
              <p id="reset-password-hint" className="text-text-dim text-sm mt-1">
                לפחות 8 תווים, אות ומספר
              </p>
            </div>

            <div>
              <label htmlFor="reset-confirm" className="block text-sm text-text-dim mb-1">
                אישור סיסמה
              </label>
              <input
                id="reset-confirm"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="input-base w-full px-3 py-2 text-base"
                placeholder="••••••••"
                autoComplete="new-password"
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
              {loading ? 'מעדכן...' : 'עדכן סיסמה'}
            </button>
          </form>
        ) : (
          <div className="border border-green/30 bg-green-tint rounded-md p-5 text-center">
            <p className="text-green font-semibold">הסיסמה עודכנה בהצלחה ✓</p>
            <p className="text-text-dim text-sm mt-1">מעביר אותך לדאשבורד...</p>
          </div>
        )}
      </div>
    </div>
  )
}
