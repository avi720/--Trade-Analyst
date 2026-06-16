import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trade Analysis',
  description: 'יומן מסחר חכם עם AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-bg-dark text-text-main min-h-screen font-sans">
        {children}
      </body>
    </html>
  )
}
