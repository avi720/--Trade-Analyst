import type { Metadata } from 'next'
import { Assistant, IBM_Plex_Mono } from 'next/font/google'
import { getBaseUrl } from '@/lib/utils'
import { PostHogProvider } from '@/components/posthog-provider'
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

const BASE_URL = getBaseUrl()
const SITE_NAME = 'Trade Analyst'
const SITE_TAGLINE = 'יומן מסחר חכם עם AI'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  authors: [{ name: 'Aviur Paz' }],
  keywords: ['יומן מסחר', 'trading journal', 'AI', 'IBKR', 'אנליטיקה', 'מסחר'],
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    url: BASE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_TAGLINE,
    images: [
      {
        url: '/og',
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_TAGLINE,
    images: ['/og'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} ${ibmPlexMono.variable}`}>
      <body className="bg-bg-dark text-text-main min-h-dvh font-sans">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
