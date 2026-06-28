# QA Test User — מעקב ניסויי משתמש (pre-launch)

מסמך זה עוקב אחר **משתמש הבדיקה הייעודי** שמשמש ל-QA ראשוני של האתר לקראת פרסום ל-SaaS.
המטרה: לדמות משתמש אמיתי שמזין טריידים (סגורים ופתוחים, סוגים שונים, תאריכים מהעבר) ולוודא
שהמידע נשמר נכון ב-DB ושהחישובים בטאב **תחקור** (`/research`) מדויקים.

> לסשנים עתידיים: קראו מסמך זה לפני שאתם מריצים ניסויים נוספים על המשתמש הזה — הוא מסביר
> מי המשתמש, מה כבר הוזן, אילו באגים נמצאו ותוקנו, ומה ה-state הנוכחי הצפוי.

---

## 1. זהות משתמש הבדיקה

| שדה | ערך |
|---|---|
| Email | `yadefam806@ameady.com` |
| סיסמה | לא ב-repo — שמורה ב-per-project memory (`project-test-user.md`). |
| `User.id` (userId) | `d80aa9b2-0c85-4235-bf0a-a101fea75f90` |
| נוצר | 2026-05-23 |
| כתובת האתר (Vercel) | `https://trade-analyst-lyart.vercel.app` (התחקור: `/research`) |
| Supabase project ref | `nwvswntqrqqtwzrhzpmi` |

> שים לב: המשתמש `avi.paz159@gmail.com` (`85019b4f-89be-44fc-bacb-9b66923ec426`) הוא חשבון
> נפרד עם טריידים משלו (QQQ, OPTFIX, MANTEST, FIXTST, SETUPBUG). הוא **לא** קשור לניסויי ה-QA.
> בזכות RLS כל משתמש רואה רק את הטריידים שלו, כך שהתחקור של משתמש הבדיקה מבודד.

---

## 2. מטרת הניסוי

QA ראשוני של זרימת ההזנה הידנית + חישובי האנליטיקה, כהכנה לפרסום ציבורי. נבדק:

- הזנת **טריידים סגורים** מסוגים שונים (Long/Short, Win/Loss, סיבות סגירה שונות).
- הזנת **טריידים פתוחים**.
- שימוש בכל השדות (setup מובנה + custom, מצב רגשי, stop/target, הערות, פרטי הזמנה, כל הברוקרים).
- תאריכים מהעבר (כמו משתמש שמזין היסטוריה ישנה).
- אימות שה-DB (טבלאות `Trade` + `Order`) מאוכלס נכון.
- אימות שכל מדדי התחקור והגרפים מחושבים נכון מול חישוב ידני.

---

## 3. ה-Dataset הנוכחי (אחרי תיקון הבאגים — מקור אמת)

**9 טריידים סגורים** (כולם הוזנו דרך טופס "טרייד סגור", `POST /api/trades/manual/closed`).
כל הטריידים USD, עמלה $1 לכל leg (`totalCommission=2`), עם stop+target, setup, ומצב רגשי.

| Ticker | כיוון | כניסה | יציאה | כמות | stop | realizedPnl | actualR | result | סיבת סגירה |
|---|---|---|---|---|---|---|---|---|---|
| AAPL | Long | 150 | 165 | 100 | 145 | +1498 | 2.996 | Win | target |
| GOOGL | Long | 100 | 110 | 100 | 95 | +998 | 1.996 | Win | other |
| TSLA | Long | 240 | 230 | 50 | 230 | −502 | −1.004 | Loss | original_stop |
| AMZN | Long | 180 | 174 | 50 | 174 | −302 | −1.0067 | Loss | original_stop |
| NVDA | Long | 110 | 128 | 30 | 104 | +538 | 2.9889 | Win | other |
| AMD | Short | 170 | 150 | 80 | 178 | +1598 | 2.4969 | Win | target |
| NFLX | Short | 600 | 555 | 20 | 630 | +898 | 1.4967 | Win | other |
| META | Short | 480 | 500 | 40 | 500 | −802 | −1.0025 | Loss | original_stop |
| MSFT | Long | 400 | 405 | 60 | 390 | +298 | 0.4967 | Win | modified_stop (402) |

**2 טריידים פתוחים** (הוזנו דרך "הזנה ידנית", `POST /api/trades/manual`):

| Ticker | כיוון | כניסה | כמות | stop | הערות |
|---|---|---|---|---|---|
| SPY | Long | 580 | 10 | 560 | מאוכלס מלא (setup/stop/target/notes/didRight) |
| COIN | Short | 250 | 25 | — | **חלקי** — חסרים stop/target/setup/notes (אבדו עקב ניתוק אינטרנט באמצע מילוי הטופס ב-round 1) |

### מדדי התחקור הצפויים עבור ה-Dataset הזה
(לאימות ב-`/research` — אם משהו מהם השתנה בלי שהוספתם/הסרתם טריידים, יש רגרסיה)

| מדד | ערך |
|---|---|
| טריידים | 9 |
| אחוז הצלחה | 66.7% (6W / 3L) |
| R ממוצע | +1.05R |
| Profit Factor | 3.63 |
| Expectancy | +1.05R |
| Max Drawdown | −$802.00 |
| סה״כ P&L | +$4,222.00 |
| ממוצע רווח / הפסד | +$971.33 / −$535.33 |

התפלגות R: 3 ב-`<−2..−1` (TSLA/AMZN/META) · 1 ב-`0..1` (MSFT) · 2 ב-`1..2` (GOOGL/NFLX) · 3 ב-`>2` (AAPL/NVDA/AMD).

---

## 4. באגים שנמצאו ותוקנו

נמצאו תוך כדי ה-QA הראשוני, ותוקנו ב-commit **`b2c3652`** (branch `main`).

### באג 1 — `actualR=null` בטריידים סגורים שהוזנו עם סטופ
ב-flow של ההזנה הידנית, ה-`stopPrice` נכתב ל-`Trade` כ-annotation **אחרי** שה-FIFO כבר סגר
את הטרייד (בנקודה הזו `stopPrice=null`, ולכן ה-CLOSE לא ייצר R-multiple). התוצאה: כל מדדי ה-R
בתחקור (R ממוצע, Expectancy, עקומת הון, התפלגות R) התעלמו מטריידים אלה.

**תיקון:** `lib/trade/recompute-actual-r.ts` → `recomputeActualR()`, נקראת בשני הנתיבים
(`app/api/trades/manual/closed/route.ts`, `app/api/trades/manual/route.ts`) אחרי שה-stop נשמר.
אידמפוטנטי לזרימת פתיחה→סגירה בהגשות נפרדות (שכבר עבדה).

### באג 2 — עמלת הפתיחה לא נוכתה מ-`realizedPnl`
`realizedPnl` ניכה רק את עמלת הסגירה. **תיקון** ב-`lib/trade/fifo.ts`: `OPEN` מאתחל
`realizedPnl = -commission`, ו-`SCALE_IN` מנכה גם הוא את עמלת התוספת
(+ ה-persist של SCALE_IN ב-`lib/ibkr/process-executions.ts` כותב כעת `realizedPnl`).
כך טרייד סגור: `realizedPnl = רווח ברוטו − (עמלת פתיחה + כל עמלות הסגירה)`.

> שני הבאגים אומתו חי אחרי הפריסה (ראו טבלת ה-Dataset לעיל — לדוגמה AAPL: `realizedPnl=1498`
> = 1500−2, `actualR=2.996`). 175 טסטי יחידה + `npm run build` עוברים.

---

## 5. לקחים תפעוליים (חשוב להזנות עתידיות)

- **Vercel cold start:** פונקציות serverless עלולות להיות קרות לאחר חוסר פעילות. בקשות `POST` ל-API עלולות להיתקע כמה שניות בתחילה. **אל תירה הרבה בקשות POST במקביל/ברצף** — בקשות תלויות מצטברות, מציפות את connection pool של Supabase, ויוצרות שורות חלקיות/יתומות (במקרה אחד נוצרו 6 שורות AAPL "Open" יתומות).
  לאחר שהפונקציה חמה — כל בקשה ~2–3ש'. עדיף להזין **אחת-אחת או בקבוצות קטנות (≤3)** ולוודא הצלחה.
- **דדופ לפי `brokerExecId`:** למשתמשי הזנה ידנית, `brokerExecId = MANUAL-<TICKER>-<executedAt_ms>-<legIndex>`
  (דטרמיניסטי מהתאריך+שעה). הזנה חוזרת עם אותו ticker+תאריך+שעה תידחה כ-duplicate. כדי להזין
  מחדש "נקי" צריך קודם למחוק את השורות הקיימות (Trade + Order).
- **`Order` אין בה עמודת `ticker`** — מצטרפים דרך `Trade` (`o."tradeId" = t.id`).
- **מחיקות מתבצעות ע"י המשתמש האנושי** (מדיניות בטיחות — Claude לא מבצע מחיקות לצמיתות).

---

## 6. SQL שימושי (קריאה בלבד / איפוס)

קבוע: `userId = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90'`

```sql
-- מצב נוכחי: כל הטריידים של משתמש הבדיקה
SELECT ticker, direction, status, "realizedPnl", "actualR", "stopPrice", result,
       "totalCommission", "setupType", "emotionalState", "closeReason", source,
       "openedAt", "closedAt"
FROM "Trade"
WHERE "userId" = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90'
ORDER BY "openedAt";

-- אימות actualR מול הנוסחה (check_r אמור להיות שווה ל-actualR)
SELECT ticker, "realizedPnl", "actualR",
       round((("realizedPnl")::numeric /
             (abs("avgEntryPrice"-"stopPrice")*"totalQuantityOpened")), 4) AS check_r
FROM "Trade"
WHERE "userId" = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90' AND status='Closed';

-- ה-Orders (join ל-Trade כי אין ticker ב-Order)
SELECT o.side, o."brokerExecId", o."executedAt", o.price, o.commission,
       o."orderType", o."orderTime", t.ticker, t.status
FROM "Order" o JOIN "Trade" t ON t.id = o."tradeId"
WHERE o."userId" = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90'
ORDER BY o."executedAt";
```

### איפוס ל-slate נקי (מחיקה — להריץ ידנית ב-Supabase)
```sql
-- מחיקת כל הטריידים הסגורים + ה-Orders שלהם (משאיר את הפתוחים)
DELETE FROM "Order"
WHERE "userId" = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90'
  AND "tradeId" IN (SELECT id FROM "Trade"
                    WHERE "userId" = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90'
                      AND status = 'Closed');
DELETE FROM "Trade"
WHERE "userId" = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90' AND status = 'Closed';

-- ניקוי שורות פגומות/יתומות של טיקר ספציפי (למשל אחרי פיל-אפ של בקשות תלויות)
DELETE FROM "Order"
WHERE "userId" = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90'
  AND "brokerExecId" LIKE 'MANUAL-AAPL-%';
DELETE FROM "Trade"
WHERE "userId" = 'd80aa9b2-0c85-4235-bf0a-a101fea75f90' AND ticker = 'AAPL';
```

---

## 7. יומן סשנים

| תאריך | מה נעשה |
|---|---|
| 2026-05-24 | QA ראשוני: הוזנו 9 סגורים + 2 פתוחים. אומת DB + תחקור (כל המדדים תאמו לחישוב ידני). נמצאו 2 באגים (actualR=null, עמלת פתיחה). תוקנו ב-`b2c3652`, נפרס, אומת חי. ה-Dataset הוזן מחדש כך שכל 9 הסגורים מקבלים actualR. (COIN נשאר חלקי מ-round 1.) |
