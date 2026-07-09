import type { Metadata } from 'next'
import { Calculator, Target, LineChart, TrendingUp } from 'lucide-react'
import { FeatureLanding } from '@/components/landing/feature-landing'

export const metadata: Metadata = {
  title: 'אנליטיקת FIFO ו-R-multiples',
  description:
    'כל עסקה מחושבת בשיטת FIFO מדויקת ומתורגמת ל-R-multiples, win-rate, drawdown והתפלגויות לפי setup ושעה — כדי שתראה בדיוק מה עובד לך במסחר ומה לא.',
}

export default function FifoAnalyticsPage() {
  return (
    <FeatureLanding
      eyebrow="אנליטיקה"
      title={
        <>
          לא עוד ניחושים.
          <br />
          אנליטיקה שמבוססת על <span className="text-amber">הנתונים שלך.</span>
        </>
      }
      subtitle="כל עסקה מחושבת בשיטת FIFO מדויקת ומתורגמת ל-R-multiples, win-rate, drawdown והתפלגויות — כדי שתראה בדיוק מה עובד לך ומה לא, בלי גיליונות Excel."
      benefitsHeading="מה תגלה על המסחר שלך"
      benefits={[
        {
          Icon: Calculator,
          title: 'חשבונאות FIFO',
          body: 'התאמת קניות למכירות בשיטת First-In-First-Out, בדיוק כמו הברוקר. רווח והפסד אמיתי לכל טרייד.',
        },
        {
          Icon: Target,
          title: 'R-multiples',
          body: 'כל טרייד נמדד ביחס לסיכון שלקחת, כך שתראה אם המנצחים שלך באמת גדולים מהמפסידים.',
        },
        {
          Icon: LineChart,
          title: 'התפלגויות וגרפים',
          body: 'ביצועים לפי setup, שעה ביום, רגש וטווח R. הדפוסים שחוזרים אצלך קופצים לעיניים.',
        },
        {
          Icon: TrendingUp,
          title: 'Drawdown ו-win-rate',
          body: 'המדדים שחשובים באמת — max drawdown, אחוז הצלחה, ותוחלת לכל עסקה.',
        },
      ]}
      stepsHeading="איך זה עובד"
      steps={[
        {
          title: 'מזינים עסקאות',
          body: 'ידנית, מ-Excel, או אוטומטית מ-IBKR. אנחנו לא בררנים לגבי המקור.',
        },
        {
          title: 'אנחנו מחשבים',
          body: 'מנוע ה-FIFO מתאים קניות למכירות ומחשב R, PnL ועמלות לכל טרייד.',
        },
        {
          title: 'אתה מבין',
          body: 'לוח research מלא עם 8 KPIs ו-7 גרפים, שאפשר לפלטר ולעשות drill-down מכל מספר.',
        },
      ]}
      closingTitle="מוכן לראות את המספרים האמיתיים שלך?"
      closingBody="לוח ה-research המלא זמין כבר במסלול החינמי."
    />
  )
}
