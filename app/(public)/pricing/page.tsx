import type { Metadata } from 'next'
import Link from 'next/link'
import { CreditCard, XCircle, Sparkles, ArrowLeft } from 'lucide-react'
import { PricingPlans } from '@/components/landing/pricing-plans'

export const metadata: Metadata = {
  title: 'תמחור',
  description:
    'תמחור פשוט ושקוף ל-Trade Analyst — מתחילים חינם בלי כרטיס אשראי, ומשדרגים ל-Pro רק כשסנכרון אוטומטי מ-IBKR וחנן ללא הגבלה עוזרים לך. ביטול בקליק, בכל רגע.',
}

export default function PricingPage() {
  return (
    <div className="relative">
      {/* Ambient amber glow, echoing the landing hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 -z-0 mx-auto h-[320px] max-w-3xl opacity-80"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(255,184,0,0.14) 0%, rgba(255,184,0,0.03) 40%, transparent 70%)',
        }}
      />

      {/* Intro */}
      <div className="relative text-center">
        <h1 className="text-3xl font-bold text-text-main sm:text-4xl">
          תמחור פשוט ושקוף
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-text-dim">
          בלי כרטיס אשראי כדי להתחיל, ובלי הפתעות בסוף החודש. תתחיל חינם, תראה אם
          היומן באמת עוזר לך להבין את המסחר שלך — ותשדרג רק אם וכשזה ירגיש נכון.
        </p>
      </div>

      {/* Plans */}
      <div className="relative mt-12">
        <PricingPlans />
      </div>

      {/* Reassurance points */}
      <div className="relative mt-16 grid gap-4 sm:grid-cols-3">
        <Reassurance
          Icon={CreditCard}
          title="מתחילים בלי כרטיס"
          body="נרשמים ומתחילים לתעד עסקאות מיד. המסלול החינמי הוא לתמיד, לא תקופת ניסיון מוסווית."
        />
        <Reassurance
          Icon={Sparkles}
          title="14 ימי Pro חינם"
          body="כל תכונות ה-Pro פתוחות שבועיים לפני החיוב הראשון. לא התאהבת — לא שילמת."
        />
        <Reassurance
          Icon={XCircle}
          title="ביטול בכל רגע"
          body="שינית דעה? ביטול בקליק אחד מהפרופיל, בלי שיחות שכנוע ובלי טפסים. הנתונים נשארים איתך."
        />
      </div>

      {/* Billing FAQ */}
      <div className="relative mt-20">
        <h2 className="text-center text-2xl font-semibold text-text-main">
          שאלות על החיוב
        </h2>
        <div className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel-bg">
          {FAQ.map((it) => (
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

      {/* Soft closing note */}
      <div className="relative mt-16 text-center">
        <p className="text-text-dim">
          יש עוד שאלה לפני שמתחילים?{' '}
          <a
            href="mailto:support@tradeanalyst.app"
            className="text-amber hover:underline"
          >
            נשמח לענות
          </a>
          .
        </p>
        <Link
          href="/signup"
          className="group mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-amber px-6 py-3 text-sm font-semibold text-bg-dark transition-all hover:bg-amber/90 hover:shadow-[0_0_24px_-4px_rgba(255,184,0,0.5)]"
        >
          התחל חינם
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
        </Link>
      </div>
    </div>
  )
}

function Reassurance({
  Icon,
  title,
  body,
}: {
  Icon: typeof CreditCard
  title: string
  body: string
}) {
  return (
    <div className="rounded-xl border border-border bg-panel-bg/60 p-5 text-center">
      <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber/10 text-amber">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <h3 className="text-sm font-semibold text-text-main">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-dim">{body}</p>
    </div>
  )
}

const FAQ = [
  {
    q: 'מה קורה כשאני מבטל?',
    a: 'אתה נשאר Pro עד סוף התקופה ששילמת עליה, ואז החשבון עובר אוטומטית ל-Free. שום דבר לא נמחק — כל העסקאות, ההערות והנתונים נשארים איתך במסלול החינמי.',
  },
  {
    q: 'מחיר מבצע ההשקה יישאר לתמיד?',
    a: 'מבצע ההשקה חל על ההתחלה — במסלול החודשי על 3 החודשים הראשונים, ובמסלול השנתי על השנה הראשונה. אחרי זה החיוב עובר למחיר הרגיל. נגיד לך את זה מראש, בלי אותיות קטנות.',
  },
  {
    q: 'איך מעובד התשלום?',
    a: 'התשלום מעובד דרך Lemon Squeezy, שמשמשת כ-Merchant of Record. אנחנו לא רואים ולא שומרים את פרטי כרטיס האשראי שלך — הם נשארים אצל ספק התשלומים בלבד.',
  },
  {
    q: 'מה בעצם ההבדל בין Free ל-Pro?',
    a: 'ב-Free יש לך לוח research מלא, חיפוש, והזנה ידנית של עד 30 טריידים. Pro פותח הזנה ללא הגבלה, ייבוא Excel, סנכרון אוטומטי מ-Interactive Brokers, וחנן ללא הגבלה עם מצב מעמיק שמריץ סטטיסטיקות מותאמות על השאלה שלך.',
  },
]
