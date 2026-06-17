import type { Metadata } from 'next'
import { Assistant, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

// Self-hosted via next/font — no runtime DNS lookup to fonts.googleapis.com
// and zero layout shift. Exposed as CSS variables consumed by Tailwind's
// font-sans (Assistant, Hebrew + Latin) and font-mono (IBM Plex Mono, numerics).
const assistant = Assistant({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-assistant',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

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
    <html lang="he" dir="rtl" className={`${assistant.variable} ${ibmPlexMono.variable}`}>
      <body className="bg-bg-dark text-text-main min-h-dvh font-sans">
        {children}
      </body>
    </html>
  )
}
