import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'כניסה',
  description: 'היכנס לחשבון שלך ב-Trade Analyst כדי לצפות באנליטיקות המסחר שלך.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
