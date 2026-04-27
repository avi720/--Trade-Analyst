# פרומפט לסשן 7 — Phase 7 AI Chat (חנן)

## מה נעשה ב-Phase 6

**Phase 6 הושלמה בהצלחה** ✅

- **4 utility functions** חדשות ב-`lib/utils/research-charts.ts` לעיבוד נתונים של גרפים
- **Research Dashboard client component** — 7 פילטרים, 8 כרטיסי מטריקות, 6 גרפים Recharts עם toggle visibility
- **Server component** שמושך כל הטריידים הסגורים מ-Supabase
- **23 unit tests** — כולם עובדים (144/144 tests total ✅)
- **Build clean** — TypeScript ללא שגיאות

**חשוב**: הועברנו מ-`getHours()/getDay()` ל-`getUTCHours()/getUTCDay()` לעקביות עם timestamps של IBKR (UTC normalization).

---

## קבצים חובה לקרוא לפני תכנון Phase 7

1. **`docs/phase-6-handoff.md`** — סיכום Phase 6, סטטוס בדיקות, הערות ארכיטקטוניות
2. **`CLAUDE.md`** בתוך הrepo — ארכיטקטורה מלאה, patterns, quirks של המכונה, כל שלבי הפיתוח
3. **`trade-analysis-prompt.md`** (אם יש) — סעיף Phase 7: AI Chat requirements

---

## Phase 7 — AI Chat (חנן) — מה לבנות

### סקירה

חיבור **server-side** של Gemini API. שתי מצבי context (חכם / כל הדאטה). שמירת conversation history בDB.

### בנו שנדרש

1. **`app/api/chat/route.ts`**
   - POST /api/chat endpoint
   - קבלת `{ message: string, conversationId?: string, contextMode: 'smart' | 'full' }`
   - קריאה ל-Gemini עם system prompt בעברית
   - שמירת conversation ב-`AIConversation` table
   - חזרה: `{ role, content, createdAt }`

2. **`lib/chat/gemini-client.ts`**
   - `callGemini(message, systemPrompt, context, retries=5)` function
   - exponential backoff על errors
   - handling rate limits (429)
   - error handling: clear messages to user, logging

3. **`components/chat-sidebar.tsx`** — UPDATE
   - החליפו את ה-disabled input בלייווט live
   - form עם input field + send button
   - טוען messages מ-DB on mount
   - toggle button for context mode ("חכם" / "שלח את כל הדאטה")
   - "new conversation" button
   - message history scrollable panel

4. **`__tests__/chat/gemini-client.test.ts`**
   - unit tests ל-`callGemini()`
   - mock Google SDK
   - retry logic, error scenarios, timeout

### ארכיטקטורה

**Two context modes**:
- **"חכם" (default)**: compact summary only — filtered metrics + trade list summary (token-efficient)
- **"שלח את כל הדאטה"**: full JSON schema (expensive, but better analysis)

**System prompt**: "חנן" persona בעברית. Existing code בפרויקט הישן (React + Gemini). Port אותו ל-server-side. שאל את המשתמש אם צריך tweaks.

**Gemini key**: **NEVER client-side**. All calls via `/api/chat` (server-side, secure).

**Conversation storage**:
- `AIConversation` table — `{ id, userId, contextType, messages: JSON[], createdAt, updatedAt }`
- `messages` = `{ role: 'user' | 'assistant', content: string, createdAt: Date }[]`
- localStorage: store active conversation ID + context mode (client-side state)

### שאלות לחכמה לפני התחלת Phase 7

1. **Context mode default** — "חכם" או "שלח את כל הדאטה"? (אני מניח "חכם" בגלל עלויות)
2. **System prompt tweaks** — האם לשמור בדיוק את ה-persona "חנן" מהמערכת הישנה, או שיפורים?
3. **Error handling** — איך להציג שגיאות לאוזר? Toast? Alert? Inline message בchat?
4. **Token limits** — Gemini Flash-2.0 יש context window גדול — צריך לחתוך conversation history או לשמור הכל?

---

## סטטוס בדיקות ובילד

✅ **144/144 tests** — כולם עוברים (כולל 23 בדיקות חדשות ל-research-charts)
✅ **Build clean** — TypeScript, no errors
✅ **GitHub pushed** — `https://github.com/avi720/--Trade-Analyst2`

---

## סטטוס Phases

| Phase | תוכן | סטטוס |
|-------|------|--------|
| 0 | Planning | ✅ |
| 1 | Foundation | ✅ |
| 2 | DB Models + FIFO | ✅ |
| 3 | IBKR Flex | ✅ |
| 4 | Polygon Prices | ✅ |
| 5 | Real-Time Dashboard | ✅ |
| 6 | Research Dashboard | ✅ |
| 7 | AI Chat (חנן) | 🔲 **NEXT** |
| 8 | Search + Polish + Export | 🔲 |

---

## הערות למהנדס שיכנס ל-Phase 7

1. **Gemini SDK** (`@google/generative-ai`) כבר installed.
2. **Exponential backoff pattern** — ראה קוד קדום מהפרויקט הישן אם צריך reference.
3. **localStorage vs DB** — אם context mode משתנה בתדירות גבוהה, store ב-localStorage; אם נדיר, ב-`User.settings`.
4. **Conversation history** — אם משתמש משנה את filter בdashboard, האם conversation נחדש? (שאל את המשתמש).
5. **Rate limiting** — Gemini יכול להיות מוגבל; exponential backoff חובה.

---

## בדוק קודם

קרא את `phase-6-handoff.md` בהתחלת הסשן.
