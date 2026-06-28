import Link from 'next/link'

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-bg-dark px-6 py-8 text-sm text-text-dim">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>© {new Date().getFullYear()} Trade Analyst · אביאור פז</div>
        <nav className="flex flex-wrap items-center gap-4">
          <Link href="/terms" className="hover:text-text-main transition-colors">
            תנאי שימוש
          </Link>
          <Link href="/privacy" className="hover:text-text-main transition-colors">
            מדיניות פרטיות
          </Link>
          <a
            href="mailto:support@tradeanalyst.app"
            className="hover:text-text-main transition-colors"
          >
            support@tradeanalyst.app
          </a>
        </nav>
      </div>
    </footer>
  )
}
