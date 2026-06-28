import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TradeLogoIcon } from '@/components/trade-logo'
import { PublicFooter } from '@/components/public-footer'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    redirect('/research')
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg-dark">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
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

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold text-text-main sm:text-5xl">
              יומן מסחר חכם.
              <br />
              <span className="text-amber">תובנות אמיתיות מהטריידים שלך.</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-text-dim">
              ייבא עסקאות מ-Interactive Brokers או ידנית, וקבל אנליטיקה
              סטטיסטית, גרפים, וניתוח של עוזר AI שמכיר את ההיסטוריה שלך.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-md bg-amber px-6 py-3 text-sm font-semibold text-bg-dark transition-colors hover:bg-amber/90"
              >
                התחל עכשיו — חינם
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-md border border-border bg-panel-bg px-6 py-3 text-sm font-medium text-text-main transition-colors hover:border-amber hover:text-amber"
              >
                כבר יש לי חשבון
              </Link>
            </div>
            <p className="mt-4 text-xs text-text-dim">
              ללא כרטיס אשראי · 14 ימי ניסיון חינם ל-Pro
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-16 bg-panel-bg/30">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-12 text-center text-2xl font-semibold text-text-main">
              למה Trade Analyst
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Feature
                title="ייבוא אוטומטי מ-IBKR"
                body="חיבור חד-פעמי ל-Flex Web Service וסנכרון יומי של כל העסקאות שלך. ללא העתקה ידנית, ללא טעויות."
              />
              <Feature
                title="אנליטיקה עמוקה"
                body="R-multiples, FIFO accounting, win-rate, max drawdown, התפלגות לפי setup, ביצועים לפי שעת יום."
              />
              <Feature
                title="עוזר AI: חנן"
                body="שאלות חופשיות על הנתונים שלך. חנן עונה לפי הסטטיסטיקה האמיתית של הטריידים שלך, לא לפי דעות גנריות."
              />
              <Feature
                title="חיפוש וסינון מתקדם"
                body="פילטרים מרובים — טווחי מחיר, תאריך, R, setup, רגש. כולל drill-down מ-KPIs לעסקאות."
              />
              <Feature
                title="פרטיות ראשונה"
                body="כל הנתונים שלך מוצפנים. RLS ברמת המסד. הצפנת AES-256-GCM לטוקני ברוקר. ללא מעקב צד שלישי."
              />
              <Feature
                title="עברית RTL מלאה"
                body="ממשק בעברית מלא, RTL, כולל גרפים, טבלאות, ומיילים. בנוי במיוחד לסוחר הישראלי."
              />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="px-6 py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-3 text-center text-2xl font-semibold text-text-main">
              תמחור פשוט
            </h2>
            <p className="mb-12 text-center text-text-dim">
              התחל חינם. שדרג כשתרצה יותר.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <PricingCard
                name="Free"
                price="$0"
                priceSuffix="לתמיד"
                cta="התחל עכשיו"
                features={[
                  'ייבוא ידני של עסקאות',
                  'לוח research מלא',
                  'חיפוש וסינון',
                  '3 הודעות לחנן ביום (מצב בסיסי)',
                ]}
              />
              <PricingCard
                name="Pro"
                price="$19.99"
                priceSuffix="לחודש"
                cta="14 ימי ניסיון חינם"
                highlighted
                features={[
                  'כל מה שב-Free',
                  'סנכרון אוטומטי מ-Interactive Brokers',
                  'חנן ללא הגבלה + מצב Pro מעמיק',
                  'ייצוא CSV',
                  'תמיכה מהירה',
                ]}
              />
            </div>
            <p className="mt-6 text-center text-xs text-text-dim">
              גם תכנית שנתית במחיר $179.99 (חיסכון של ~25%)
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 py-16 bg-panel-bg/30">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold text-text-main mb-4">
              מוכן להתחיל?
            </h2>
            <p className="text-text-dim mb-8">
              חינם להתחיל, בלי כרטיס אשראי.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-amber px-8 py-3 text-base font-semibold text-bg-dark transition-colors hover:bg-amber/90"
            >
              הרשמה
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel-bg p-6">
      <h3 className="text-lg font-semibold text-text-main mb-2">{title}</h3>
      <p className="text-sm leading-relaxed text-text-dim">{body}</p>
    </div>
  )
}

function PricingCard({
  name,
  price,
  priceSuffix,
  cta,
  features,
  highlighted,
}: {
  name: string
  price: string
  priceSuffix: string
  cta: string
  features: string[]
  highlighted?: boolean
}) {
  return (
    <div
      className={
        'rounded-lg p-8 ' +
        (highlighted
          ? 'border-2 border-amber bg-panel-bg'
          : 'border border-border bg-panel-bg')
      }
    >
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xl font-semibold text-text-main">{name}</h3>
        {highlighted && (
          <span className="rounded-md bg-amber/20 px-2 py-0.5 text-xs font-medium text-amber">
            מומלץ
          </span>
        )}
      </div>
      <div className="mb-6 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold text-text-main">{price}</span>
        <span className="text-sm text-text-dim">/ {priceSuffix}</span>
      </div>
      <ul className="space-y-2 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-text-main/90">
            <span className="text-amber mt-0.5">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={
          'inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors ' +
          (highlighted
            ? 'bg-amber text-bg-dark hover:bg-amber/90'
            : 'border border-border bg-bg-dark text-text-main hover:border-amber hover:text-amber')
        }
      >
        {cta}
      </Link>
    </div>
  )
}
