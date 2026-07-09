import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'הרשמה',
  description: 'צור חשבון ב-Trade Analyst והתחל לנתח את ביצועי המסחר שלך בצורה חכמה.',
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
