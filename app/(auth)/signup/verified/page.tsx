import { TrackOnMount } from '@/components/analytics/track-on-mount'

export default async function SignupVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  // /auth/callback sends `reason=exchange_failed` when the PKCE code->session exchange
  // failed. The copy below is correct either way (the email IS verified), but only this
  // branch is a failure worth counting — a plain visit is the normal success path.
  const exchangeFailed = reason === 'exchange_failed'

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-dark px-4">
      {exchangeFailed && <TrackOnMount event="oauth_callback_failed" />}
      <div className="panel p-8 w-full max-w-sm text-center space-y-5">
        <div className="w-12 h-12 rounded-full bg-green-tint border border-green/30 flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2CC84A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div>
          <h1 className="text-xl font-bold text-text-main">האימות הצליח</h1>
          <p className="text-text-dim text-sm mt-2 leading-relaxed">
            ניתן לסגור כרטיסייה זו ולחזור לכרטיסיית ההרשמה כדי להמשיך.
          </p>
        </div>
      </div>
    </div>
  )
}
