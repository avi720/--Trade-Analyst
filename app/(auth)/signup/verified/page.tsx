export default function SignupVerifiedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080808] px-4">
      <div className="panel p-8 w-full max-w-sm text-center space-y-5">
        <div className="w-12 h-12 rounded-full bg-[#0d2211] border border-[#2CC84A]/30 flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2CC84A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div>
          <h1 className="text-xl font-bold text-[#E0E0E0]">האימות הצליח</h1>
          <p className="text-[#888888] text-sm mt-2 leading-relaxed">
            ניתן לסגור כרטיסייה זו ולחזור לכרטיסיית ההרשמה כדי להמשיך.
          </p>
        </div>
      </div>
    </div>
  )
}
