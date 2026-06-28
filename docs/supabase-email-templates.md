# Supabase Email Templates — Hebrew drafts

These drafts go into the Supabase Dashboard at **Authentication → Email Templates**. Paste each template into its respective tab (Subject + Body).

**Prerequisites before pasting:**
- `SITE_URL` set to `https://tradeanalyst.app` (production) in Supabase Dashboard → Authentication → URL Configuration.
- Custom SMTP configured to send from `support@tradeanalyst.app` (Zoho Mail or similar). Without custom SMTP the sender is `noreply@mail.app.supabase.io` which lands in spam much more easily.

After pasting all four templates, verify by:
1. Signing up a fresh test email on production → confirm the confirmation email arrives in Hebrew, from `support@tradeanalyst.app`, with a working link.
2. Triggering password reset on the same account → confirm same.
3. Initiating an email change in the app → confirm same.

---

## 1. Confirm signup

**Subject:**
```
אישור הרשמה ל-Trade Analyst
```

**Body (HTML):**
```html
<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.6;">
  <h2 style="color: #1a1a1a; margin-top: 0;">ברוכים הבאים ל-Trade Analyst</h2>
  <p>נרשמת בהצלחה. כדי להפעיל את חשבונך, לחץ על הקישור הבא:</p>
  <p style="margin: 32px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; background: #FFB800; color: #080808; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      אישור החשבון
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">
    אם לא ביקשת להירשם — אפשר להתעלם מהמייל הזה.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #999; font-size: 12px;">
    Trade Analyst · יומן מסחר חכם עם AI<br>
    לשאלות: <a href="mailto:support@tradeanalyst.app" style="color: #666;">support@tradeanalyst.app</a>
  </p>
</div>
```

---

## 2. Reset password

**Subject:**
```
איפוס סיסמה ל-Trade Analyst
```

**Body (HTML):**
```html
<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.6;">
  <h2 style="color: #1a1a1a; margin-top: 0;">איפוס סיסמה</h2>
  <p>קיבלנו בקשה לאיפוס הסיסמה לחשבון שלך ב-Trade Analyst.</p>
  <p>לחץ על הקישור הבא כדי לבחור סיסמה חדשה:</p>
  <p style="margin: 32px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; background: #FFB800; color: #080808; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      איפוס סיסמה
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">
    הקישור תקף ל-60 דקות. אם לא ביקשת לאפס את הסיסמה — אפשר להתעלם מהמייל הזה,
    הסיסמה לא תשתנה.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #999; font-size: 12px;">
    Trade Analyst · יומן מסחר חכם עם AI<br>
    לשאלות: <a href="mailto:support@tradeanalyst.app" style="color: #666;">support@tradeanalyst.app</a>
  </p>
</div>
```

---

## 3. Magic link

**Subject:**
```
התחברות ל-Trade Analyst
```

**Body (HTML):**
```html
<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.6;">
  <h2 style="color: #1a1a1a; margin-top: 0;">קישור התחברות</h2>
  <p>ביקשת להתחבר ל-Trade Analyst. לחץ על הקישור הבא כדי להיכנס:</p>
  <p style="margin: 32px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; background: #FFB800; color: #080808; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      התחברות
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">
    הקישור תקף לזמן מוגבל. אם לא ביקשת להתחבר — אפשר להתעלם מהמייל הזה.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #999; font-size: 12px;">
    Trade Analyst · יומן מסחר חכם עם AI<br>
    לשאלות: <a href="mailto:support@tradeanalyst.app" style="color: #666;">support@tradeanalyst.app</a>
  </p>
</div>
```

---

## 4. Change email (confirm new address)

**Subject:**
```
אישור שינוי אימייל ב-Trade Analyst
```

**Body (HTML):**
```html
<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.6;">
  <h2 style="color: #1a1a1a; margin-top: 0;">אישור שינוי כתובת אימייל</h2>
  <p>
    ביקשת לעדכן את כתובת האימייל בחשבונך ב-Trade Analyst לכתובת הזו.
    כדי לאשר את השינוי, לחץ על הקישור:
  </p>
  <p style="margin: 32px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; background: #FFB800; color: #080808; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      אישור הכתובת החדשה
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">
    אם לא ביקשת לשנות את כתובת האימייל — צור איתנו קשר בכתובת
    <a href="mailto:support@tradeanalyst.app" style="color: #FFB800;">support@tradeanalyst.app</a>.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #999; font-size: 12px;">
    Trade Analyst · יומן מסחר חכם עם AI
  </p>
</div>
```

---

## Notes for the operator

- All four templates use the `{{ .ConfirmationURL }}` variable, which Supabase populates with the correct callback URL built from your `SITE_URL`. So as long as `SITE_URL=https://tradeanalyst.app` in the dashboard, the links work.
- Color `#FFB800` matches the app's amber accent. Color `#080808` matches the dark background — used as button text on the amber background for high contrast.
- All bodies are `dir="rtl"` for proper Hebrew rendering across all major mail clients (Gmail web/mobile, Apple Mail, Outlook).
- Plaintext fallback: Supabase generates a plaintext version automatically by stripping HTML; that's acceptable for v1.
