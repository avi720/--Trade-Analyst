import Link from 'next/link'
import { TradeLogoIcon } from '@/components/trade-logo'
import { PublicFooter } from '@/components/public-footer'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-dark">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <TradeLogoIcon size={32} />
            <span className="font-mono text-base font-semibold text-text-main">
              Trade Analyst
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-text-dim">
            <Link href="/login" className="hover:text-text-main transition-colors">
              כניסה
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-amber px-3 py-1.5 text-bg-dark transition-colors hover:bg-amber/90"
            >
              הרשמה
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>

      <PublicFooter />
    </div>
  )
}
