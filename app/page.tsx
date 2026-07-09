import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Link2,
  LineChart,
  Sparkles,
  Search,
  ShieldCheck,
  Languages,
  ArrowLeft,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TradeLogoIcon } from '@/components/trade-logo'
import { PublicFooter } from '@/components/public-footer'
import { PricingSection } from '@/components/landing/pricing-section'
import { LandingVideo } from '@/components/landing/landing-video'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    redirect('/research')
  }

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Trade Analyst',
    url: 'https://tradeanalyst.app',
    logo: 'https://tradeanalyst.app/og',
    sameAs: [],
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: it.a,
      },
    })),
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg-dark">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <header className="sticky top-0 z-40 border-b border-border bg-bg-dark/80 px-6 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <TradeLogoIcon size={32} />
            <span className="font-mono text-base font-semibold text-text-main">
              Trade Analyst
            </span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-text-dim transition-colors hover:text-text-main"
            >
              כניסה
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-amber px-3 py-1.5 font-semibold text-bg-dark transition-colors hover:bg-amber/90"
            >
              הרשמה
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Features />
        <PricingSection />
        <FAQ />
        <FinalCTA />
      </main>

      <PublicFooter />
    </div>
  )
}

/* ─────────── Hero ─────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-16 sm:pt-24">
      {/* Ambient amber glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 mx-auto h-[420px] max-w-8xl opacity-90"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(255,184,0,0.18) 0%, rgba(255,184,0,0.04) 40%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-5xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-panel-bg/60 px-3 py-1 text-xs text-text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-green" />
          יומן מסחר מבוסס AI
        </div>

        <h1 className="text-4xl font-bold leading-tight text-text-main sm:text-6xl">
          תפסיק לנחש.
          <br />
          <span className="text-amber">תבין מה עובד לך.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-text-dim">
        הזן עסקאות ידנית, ייבא מ-Excel, תסנכרן טריידים אוטומטית מ-Interactive Brokers
        ותקבל אנליטיקה סטטיסטית, גרפים, וניתוח של עוזר AI שמכיר את ההיסטוריה שלך.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="group inline-flex items-center justify-center gap-2 rounded-md bg-amber px-6 py-3 text-sm font-semibold text-bg-dark transition-all hover:bg-amber/90 hover:shadow-[0_0_24px_-4px_rgba(255,184,0,0.5)]"
          >
            הירשם עכשיו חינם
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md border border-border bg-panel-bg px-6 py-3 text-sm font-medium text-text-main transition-colors hover:border-amber hover:text-amber"
          >
            כבר יש לי חשבון
          </Link>
        </div>

        <LandingVideo />
      </div>
    </section>
  )
}

/* ─────────── How it works ─────────── */

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'חבר או ייבא',
      body: 'התחבר ל-Interactive Brokers Flex בקליק, ייבא Excel, או הזן ידנית. הכל בטוח — הטוקן שלך מוצפן ב-AES-256.',
    },
    {
      n: '02',
      title: 'תראה את התמונה',
      body: 'אנליטיקה אוטומטית: R-multiples, win-rate, drawdown, ביצועים לפי setup, שעה ביום ועוד.',
    },
    {
      n: '03',
      title: 'תשאל את חנן',
      body: 'עוזר AI מבוסס Gemini עונה על שאלות חופשיות — לא דעות גנריות, אלא ניתוח של ההיסטוריה שלך.',
    },
  ]

  return (
    <section className="border-y border-border bg-panel-bg/30 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold text-text-main">איך זה עובד</h2>
          <p className="mt-3 text-text-dim">
            שלושה שלבים מהחיבור הראשוני עד הראשון "רגע, אז מה השוני של הטריידים המנצחים שלי?"
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="relative rounded-xl border border-border bg-bg-dark/60 p-6"
            >
              <div className="mb-4 font-mono text-3xl font-bold text-amber">{s.n}</div>
              <h3 className="text-lg font-semibold text-text-main">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-dim">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────── Features ─────────── */

function Features() {
  const items = [
    {
      Icon: Link2,
      title: 'סנכרון אוטומטי מ-IBKR',
      body: 'חיבור חד-פעמי ל-Flex Web Service, ומהיום אנחנו מושכים את העסקאות שלך אוטומטית. ללא CSV, ללא טעויות.',
      href: '/ibkr-sync',
    },
    {
      Icon: LineChart,
      title: 'אנליטיקה עמוקה',
      body: 'R-multiples, FIFO accounting, win-rate, max drawdown, התפלגות לפי setup, ביצועים לפי שעת יום ורגש.',
      href: '/fifo-analytics',
    },
    {
      Icon: Sparkles,
      title: 'עוזר AI: חנן',
      body: 'שאלות חופשיות על הנתונים שלך. חנן עונה לפי הסטטיסטיקה האמיתית של הטריידים שלך, לא לפי דעות גנריות.',
      href: '/ai-trading-assistant',
    },
    {
      Icon: Search,
      title: 'חיפוש וסינון מתקדם',
      body: 'פילטרים מרובים — טווחי מחיר, תאריך, R, setup, רגש. Drill-down מכל KPI ישירות לעסקאות הרלוונטיות.',
    },
    {
      Icon: ShieldCheck,
      title: 'פרטיות ראשונה',
      body: 'הצפנת AES-256-GCM לטוקני ברוקר. Row-Level Security ברמת המסד. הנתונים שלך שלך בלבד.',
    },
    {
      Icon: Languages,
      title: 'עברית RTL מלאה',
      body: 'ממשק בעברית, RTL, כולל גרפים, טבלאות ופורמט מספרים. בנוי במיוחד לסוחר הישראלי.',
    },
  ]

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold text-text-main">
            כל מה שצריך יומן מסחר לעשות
          </h2>
          <p className="mt-3 text-text-dim">
            בלי גיליונות Excel, בלי לחפש למה עזבת את הטרייד באמצע.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map(({ Icon, title, body, href }) => (
            <div
              key={title}
              className="group flex flex-col rounded-xl border border-border bg-panel-bg p-6 transition-colors hover:border-amber/40"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber/10 text-amber transition-colors group-hover:bg-amber/20">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="text-base font-semibold text-text-main">{title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-text-dim">{body}</p>
              {href && (
                <Link
                  href={href}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber transition-colors hover:text-amber/80"
                >
                  מידע נוסף
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}


/* ─────────── FAQ ─────────── */

const faqItems = [
  {
    q: 'איך הנתונים שלי מוגנים?',
    a: 'טוקני IBKR שלך מוצפנים ב-AES-256-GCM לפני שהם נשמרים בבסיס הנתונים. הגישה למידע מוגבלת ברמת המסד (Row-Level Security) — כל שאילתא רואה רק את השורות שלך. אין מעקב צד שלישי.',
  },
  {
    q: 'האם אני צריך את Interactive Brokers?',
    a: 'לא. אפשר להשתמש בייבוא ידני של עסקה בודדת, בהעלאת קובץ Excel לפי התבנית שלנו, או בסנכרון אוטומטי מ-IBKR. אם אתה סוחר בברוקר אחר — הפורמט הידני יתאים.',
  },
  {
    q: 'איך אני מבטל את המנוי?',
    a: 'בקליק אחד מתפריט הפרופיל. אין שאלות, אין תקופת ביטול. תמשיך להיות Pro עד סוף התקופה שכבר שילמת עליה, ואז תעבור אוטומטית ל-Free.',
  },
  {
    q: 'מה ההבדל בין חנן ב-Free לב-Pro?',
    a: 'ב-Free יש עד 3 הודעות ביום במצב בסיסי. ב-Pro אין הגבלת הודעות ומצב "עמוק" שמריץ סטטיסטיקות מותאמות אישית על השאלה שלך במקום לענות מהזיכרון.',
  },
  {
    q: 'יש תמיכה מלאה בעברית ו-RTL?',
    a: 'כן — הממשק נבנה RTL מהיסוד, כולל טבלאות, גרפים, פורמטים של מספרים ותאריכים, ומיילים אוטומטיים. אין רכיבים שבורים כשעוברים בין דפים.',
  },
]

function FAQ() {

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-semibold text-text-main">שאלות נפוצות</h2>
          <p className="mt-3 text-text-dim">כל מה שרצית לדעת לפני שאתה נרשם.</p>
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel-bg">
          {faqItems.map((it) => (
            <details key={it.q} className="group px-6 py-4">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-right text-base font-medium text-text-main [&::-webkit-details-marker]:hidden">
                <span>{it.q}</span>
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-border text-text-dim transition-transform group-open:rotate-45">
                  <svg
                    aria-hidden
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M6 1v10M1 6h10" />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 pl-10 text-sm leading-relaxed text-text-dim">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────── Final CTA ─────────── */

function FinalCTA() {
  return (
    <section className="relative overflow-hidden border-t border-border bg-panel-bg/30 px-6 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 mx-auto h-[240px] max-w-6xl opacity-60"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(44,200,74,0.18) 0%, rgba(44,200,74,0.04) 40%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl text-center">
        <h2 className="text-3xl font-semibold text-text-main sm:text-4xl">
          מוכן לראות מה עובד לך?
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-text-dim">
          צבור טריידים, הפק מסקנות
        </p>
        <Link
          href="/signup"
          className="group mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-amber px-8 py-3 text-base font-semibold text-bg-dark transition-all hover:bg-amber/90 hover:shadow-[0_0_28px_-4px_rgba(255,184,0,0.5)]"
        >
          התחל עכשיו
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
        </Link>
      </div>
    </section>
  )
}
