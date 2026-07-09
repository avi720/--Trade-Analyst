import type { Metadata } from 'next'
import { Brain, MessageCircle, Search, Sparkles } from 'lucide-react'
import { FeatureLanding } from '@/components/landing/feature-landing'

export const metadata: Metadata = {
  title: 'חנן — עוזר AI למסחר',
  description:
    'חנן הוא עוזר AI מבוסס Gemini שעונה על שאלות חופשיות על המסחר שלך — לא דעות גנריות, אלא ניתוח של הטריידים האמיתיים שלך לפי הסטטיסטיקה שלך.',
}

export default function AiTradingAssistantPage() {
  return (
    <FeatureLanding
      eyebrow="עוזר AI"
      title={
        <>
          תשאל את חנן.
          <br />
          הוא מכיר את <span className="text-amber">ההיסטוריה שלך.</span>
        </>
      }
      subtitle="חנן הוא עוזר AI מבוסס Gemini שעונה על שאלות חופשיות על המסחר שלך — לא דעות גנריות מהאינטרנט, אלא ניתוח של הטריידים האמיתיים שלך."
      benefitsHeading="למה חנן שונה מצ'אט רגיל"
      benefits={[
        {
          Icon: Brain,
          title: 'מכיר את הנתונים שלך',
          body: 'חנן רואה את היסטוריית העסקאות שלך ועונה לפי הסטטיסטיקה שלך, לא לפי כללי אצבע כלליים.',
        },
        {
          Icon: MessageCircle,
          title: 'שאלות חופשיות',
          body: '"מה ה-setup הכי רווחי שלי?", "באיזו שעה אני מפסיד?" — שואלים בשפה רגילה, מקבלים תשובה.',
        },
        {
          Icon: Search,
          title: 'מצב מעמיק',
          body: 'במסלול Pro חנן מריץ סטטיסטיקות מותאמות על השאלה שלך במקום לענות מהזיכרון.',
        },
        {
          Icon: Sparkles,
          title: 'תובנה, לא ייעוץ',
          body: 'חנן נותן זווית על הנתונים שלך. ההחלטות במסחר תמיד נשארות שלך בלבד.',
        },
      ]}
      stepsHeading="איך זה עובד"
      steps={[
        {
          title: 'צובר טריידים',
          body: 'ככל שיש יותר היסטוריה, כך התשובות של חנן מדויקות ורלוונטיות יותר.',
        },
        {
          title: 'פותח את חנן',
          body: 'מהסרגל הצדדי, בכל מסך באפליקציה. שואל מה שרוצה, בעברית.',
        },
        {
          title: 'מקבל ניתוח',
          body: 'חנן חופר בנתונים שלך ומחזיר תשובה מבוססת-מספרים, לא דעה גנרית.',
        },
      ]}
      closingTitle="רוצה להכיר את חנן?"
      closingBody="3 הודעות ביום חינם. ללא הגבלה ומצב מעמיק במסלול Pro."
    />
  )
}
