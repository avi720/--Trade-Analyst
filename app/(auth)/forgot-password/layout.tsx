import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'שכחתי סיסמה',
  description: 'שחזר את הסיסמה לחשבון שלך ב-Trade Analyst.',
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
