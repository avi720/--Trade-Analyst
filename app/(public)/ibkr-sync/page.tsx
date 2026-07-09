import type { Metadata } from 'next'
import { Link2, ShieldCheck, Clock, RefreshCw } from 'lucide-react'
import { FeatureLanding } from '@/components/landing/feature-landing'

export const metadata: Metadata = {
  title: 'סנכרון אוטומטי מ-Interactive Brokers',
  description:
    'חבר את חשבון Interactive Brokers פעם אחת דרך Flex Web Service, וקבל את כל העסקאות שלך ביומן אוטומטית — בלי CSV, בלי הזנה ידנית. הטוקן מוצפן ב-AES-256.',
}

export default function IbkrSyncPage() {
  return (
    <FeatureLanding
      eyebrow="אינטגרציית IBKR"
      title={
        <>
          העסקאות שלך מ-Interactive Brokers,
          <br />
          <span className="text-amber">מסונכרנות אוטומטית.</span>
        </>
      }
      subtitle="מחברים פעם אחת את ה-Flex Web Service, ומהיום כל טרייד נמשך לבד — בלי CSV, בלי הדבקות ידניות, בלי לשכוח לעדכן. אתה סוחר, אנחנו מתעדים."
      benefitsHeading="למה סנכרון אוטומטי משנה את התמונה"
      benefits={[
        {
          Icon: Link2,
          title: 'חיבור חד-פעמי',
          body: 'מזינים טוקן Flex פעם אחת. מכאן זה רץ לבד, פעמיים ביום, בלי מגע יד.',
        },
        {
          Icon: ShieldCheck,
          title: 'הטוקן מוצפן',
          body: 'ה-Flex token נשמר בהצפנת AES-256-GCM ואינו ניתן לצפייה אחרי השמירה. גם אנחנו לא רואים אותו.',
        },
        {
          Icon: Clock,
          title: 'תמיד מעודכן',
          body: 'המערכת מושכת את דוח הפעילות של IBKR פעמיים ביום, כך שהיומן משקף את החשבון בלי מאמץ.',
        },
        {
          Icon: RefreshCw,
          title: 'בלי כפילויות',
          body: 'כל ביצוע מזוהה לפי מזהה ייחודי מ-IBKR, כך שסנכרון חוזר לעולם לא יוצר עסקאות כפולות.',
        },
      ]}
      stepsHeading="איך זה עובד"
      steps={[
        {
          title: 'מחברים את IBKR',
          body: 'בפרופיל ← ברוקר, מדביקים את ה-Flex token. זהו — ההגדרה נגמרה.',
        },
        {
          title: 'אנחנו מושכים',
          body: 'פעמיים ביום המערכת פונה ל-IBKR ומורידה את הביצועים החדשים שלך.',
        },
        {
          title: 'רואים תמונה מלאה',
          body: 'כל טרייד נכנס לניתוח FIFO, לגרפים ול-KPIs — אוטומטית.',
        },
      ]}
      closingTitle="רוצה לראות את זה עובד על החשבון שלך?"
      closingBody="מתחילים חינם. חיבור IBKR האוטומטי פתוח במסלול Pro."
    />
  )
}
