import Link from 'next/link'
import { TradeLogoIcon } from '@/components/trade-logo'

/**
 * Grouped site footer used on every public page. Four columns on desktop
 * (brand + Product / Legal / Support) collapsing to a stack on mobile.
 * Homepage + Login/Signup are intentionally not repeated here — the header
 * covers them, and duplicating them dilutes the footer's real job of grouping
 * navigational + informational links by intent.
 */
export function PublicFooter() {
  const productLinks = [
    { href: '/pricing',              label: 'תמחור' },
    { href: '/ibkr-sync',            label: 'סנכרון IBKR' },
    { href: '/fifo-analytics',       label: 'אנליטיקת FIFO' },
    { href: '/ai-trading-assistant', label: 'עוזר AI חנן' },
  ]

  const legalLinks = [
    { href: '/terms',   label: 'תנאי שימוש' },
    { href: '/privacy', label: 'מדיניות פרטיות' },
  ]

  return (
    <footer className="border-t border-border bg-bg-dark px-6 pb-6 pt-12 text-sm text-text-dim">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand column */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2">
              <TradeLogoIcon size={28} />
              <span className="font-mono text-sm font-semibold text-text-main">
                Trade Analyst
              </span>
            </Link>
            <p className="mt-3 leading-relaxed text-text-dim">
              יומן מסחר חכם עם AI. בעברית, מהשורש.
            </p>
          </div>

          {/* Product */}
          <FooterColumn title="מוצר">
            {productLinks.map((l) => (
              <FooterLink key={l.href} href={l.href}>
                {l.label}
              </FooterLink>
            ))}
          </FooterColumn>

          {/* Legal */}
          <FooterColumn title="משפטי">
            {legalLinks.map((l) => (
              <FooterLink key={l.href} href={l.href}>
                {l.label}
              </FooterLink>
            ))}
          </FooterColumn>

          {/* Support */}
          <FooterColumn title="תמיכה">
            <a
              href="mailto:support@tradeanalyst.app"
              className="hover:text-text-main transition-colors"
            >
              יצירת קשר
            </a>
            <span className="text-xs text-text-dim/80" dir="ltr">
              support@tradeanalyst.app
            </span>
          </FooterColumn>
        </div>

        {/* Bottom row */}
        <div className="mt-10 border-t border-border pt-6 text-xs text-text-dim/80">
          © {new Date().getFullYear()} Trade Analyst · אביאור פז
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <nav aria-label={title}>
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-text-main">
        {title}
      </h3>
      <ul className="flex flex-col gap-2">
        {Array.isArray(children)
          ? children.map((child, i) => <li key={i}>{child}</li>)
          : <li>{children}</li>}
      </ul>
    </nav>
  )
}

function FooterLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className="hover:text-text-main transition-colors">
      {children}
    </Link>
  )
}
