"use client";

import { CookiePreferences } from "@/components/consent/cookie-preferences";

export function TabCookies() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-main">עוגיות</h2>
        <p className="mt-1 text-sm text-text-dim">
          נהל אילו עוגיות אופציונליות מותר לנו להפעיל. עוגיות הכרחיות תמיד פעילות
          כי בלעדיהן השירות לא עובד.
        </p>
      </div>
      <CookiePreferences variant="settings" />
    </div>
  );
}
