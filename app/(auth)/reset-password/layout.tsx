import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'איפוס סיסמה',
  description: 'הגדר סיסמה חדשה לחשבון שלך ב-Trade Analyst.',
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
