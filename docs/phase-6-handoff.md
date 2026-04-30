# Trade Analysis — Handoff to Session 7

**Status**: Phases 0–6 complete. Ready for Phase 7 (AI Chat — חנן).
**Branch**: `main` (work directly on main, no feature branches)
**Remote**: `https://github.com/avi720/--Trade-Analyst2.git`

---

## Project

**Trade Analysis** — Hebrew RTL trading journal with AI (Next.js 14 + Supabase + IBKR Flex + Polygon + Gemini).

- **Currently single-user** (no signup UI; account created manually in Supabase dashboard).
- **Future plan: SaaS** — DB is already multi-user ready (`userId` FK + RLS on every app table). Don't add single-user shortcuts.
- Hosted on **Render** (planned: 1 Web Service + 2 Cron Jobs). Render not yet deployed — `render.yaml` exists in repo, env vars to be set in Render dashboard.

---

## Environment & Machine Quirks

- **OS**: Windows 11 Pro on **ARM64** (Snapdragon / Surface-class). Node.js at `C:\Program Files\nodejs` (standard install, v24.x).
- **Project path**: `D:\avipa\Documents\Programming\‏‏Trade Analyst` (RTL marks in folder name).
- **Shell**: Git Bash / MINGW64 — `npm` not on PATH there. Use **PowerShell**: `$env:PATH = "C:\Program Files\nodejs;$env:PATH"; npm run ...`
- **No Prisma** — eliminated due to ARM64 incompatibility. Use Supabase JS SDK directly.

---

## External Services

| Service | Status | Notes |
|---------|--------|-------|
| Supabase | ✅ Connected via MCP | Project ID: `nwvswntqrqqtwzrhzpmi` |
| Polygon | ✅ Client + cron wired | Free tier — 15 min delayed, 5 calls/min. All-tickers snapshot endpoint, filter client-side. |
| Gemini | Keys in `.env.local` | `gemini-2.0-flash`. Phase 7. |
| IBKR Flex | ✅ Integrated + tested | Token + 2 query IDs configured locally. Backfill ran successfully. |
| GitHub | Pushed | `https://github.com/avi720/--Trade-Analyst2` |
| Render | Not yet deployed | `render.yaml` ready with 2 cron jobs; env vars to set in dashboard |

---

## `.env.local` (on disk, not in git)

```env
NEXT_PUBLIC_SUPABASE_URL=https://nwvswntqrqqtwzrhzpmi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
FLEX_TOKEN_ENCRYPTION_KEY=<32-byte hex>
MASSIVE_API_KEY=<filled>
GEMINI_API_KEY=<filled>
CRON_SECRET=<random string — for cron endpoint auth>
```

---

## Phase 6 — Research Dashboard (DONE)

### Architecture

**Server Component + client component pattern** — same as Phase 5:
- `app/(dashboard)/research/page.tsx` — async server component; queries Supabase for closed trades; passes data as props.
- `components/research-dashboard.tsx` — client component; handles 7 filters, 8 metric cards, 6 Recharts charts, chart visibility toggle (saved to localStorage).
- `lib/utils/research-charts.ts` — 4 pure utility functions for chart data preparation.

### New files

| File | Purpose |
|------|---------|
| `lib/utils/research-charts.ts` | Pure functions: `pnlByTicker`, `holdTimeVsR`, `pnlByDayOfWeek`, `pnlByHour` — prepare data for charts |
| `components/research-dashboard.tsx` | Main client component: filters, 8 metric cards, 6 Recharts charts, toggle panel, chat sidebar |
| `app/(dashboard)/research/page.tsx` | Server component — fetches all closed trades from Supabase |
| `__tests__/research-charts.test.ts` | 23 unit tests for chart utility functions |

### Modified files

None — research page was a stub, replaced entirely.

### Dashboard features

**Filter bar** (7 filters, all client-side):
- Date range (openedAt): from/to date inputs
- Ticker: text search
- Setup type: dropdown of all existing setups
- Direction: Long / Short / All
- Result: Win / Loss / Breakeven / All
- Execution quality: min/max numeric (1–10)
- Hold time: min/max in hours
- "Clear filters" button when any filter is active

**Metrics row** (8 cards from `calcStats(filteredTrades)`):
- Trade count
- Win rate (%)
- Avg R
- Profit factor (or ∞ when all wins)
- Expectancy
- Max drawdown
- Total P&L
- Avg win / avg loss ratio (2 values in one card)

**Chart toggle panel**:
- Collapsible row: "גרפים מוצגים [✎ ערוך]"
- 6 checkboxes, one per chart
- State persisted to localStorage (`research_charts_visible`)
- Default: all 6 charts visible

**Chart grid** (CSS 2-column, 1 column on mobile):
1. **Equity curve** — `LineChart` of cumulative R over time (sorted by closedAt)
2. **R distribution** — `BarChart` histogram binned by actualR (6 bins: <-2R, -2R–-1R, -1R–0R, 0R–1R, 1R–2R, >2R)
3. **Setup performance** — grouped `BarChart` with dual Y-axes: avg R + win rate per setup type
4. **P&L by ticker** — horizontal `BarChart`, sorted descending by totalPnl
5. **Hold time vs R** — `ScatterChart` (one point per trade): X = hold hours, Y = actualR; colored by result (Win/Loss)
6. **P&L by day/hour** — two sub-charts in one card:
   - P&L by day-of-week (all 7 days, Hebrew names: ראשון–שבת)
   - P&L by hour (UTC, only hours that appear in data, sorted ascending)

**Colors**: green (#2CC84A) for wins/positive, red (#FF4D4D) for losses/negative, amber (#FFB800) for accents.

**Empty state**: centered message "אין טריידים סגורים בטווח זה" when no trades match filters.

**Chat sidebar**: toggle button "חנן ▶" opens sidebar stub (same as Phase 5).

### Tests

**Test status: 144/144 pass. Build clean.**

Notes on research-charts tests:
- `pnlByTicker`: grouping, sorting, null handling, winRate calculation
- `holdTimeVsR`: hour calculation, null guards, multi-day holds
- `pnlByDayOfWeek`: Hebrew day names, all 7 days always returned, UTC day-of-week
- `pnlByHour`: UTC hours (not local — consistent with IBKR), accumulation, sorting
- **Important fix**: switched from `getHours()/getDay()` to `getUTCHours()/getUTCDay()` for timezone consistency with IBKR data (all timestamps are normalized to UTC in the system).

---

## Key Changes to CLAUDE.md

Added to the "Phase 6 — Research Dashboard (COMPLETE)" section:
- New util: `research-charts.ts` with 4 chart-prep functions
- New component: `research-dashboard.tsx` client component
- Updated server page: `app/(dashboard)/research/page.tsx`
- Test coverage: `__tests__/research-charts.test.ts` with 23 tests
- All 6 charts wired (user toggles visibility, persists to localStorage)
- 7 client-side filters working
- 8 metric cards from `calcStats()`

---

## Full Roadmap

| Phase | Content | Status |
|-------|---------|--------|
| 0 | Planning | ✅ Done |
| 1 | Foundation — Next.js + Auth + Layout | ✅ Done |
| 2 | DB Models + FIFO Logic + Tests | ✅ Done |
| 3 | IBKR Flex Integration + Cron | ✅ Done |
| 4 | Polygon Price Updates | ✅ Done |
| 5 | Real-Time Dashboard (Open Positions) | ✅ Done |
| 6 | Research Dashboard | ✅ Done |
| 7 | AI Chat (חנן, server-side) | 🔲 Next |
| 8 | Search + Polish + CSV/Excel Export | 🔲 |

---

## Phase 7 — AI Chat (חנן) — NEXT

From `trade-analysis-prompt.md`:

**Overview**: Wire Gemini server-side. Two context modes. Conversation history in DB.

**Architecture**:
- `app/api/chat/route.ts` — POST endpoint. Validates request, calls Gemini API, persists conversation to DB.
- `components/chat-sidebar.tsx` — currently a stub; Phase 7 replaces disabled input with live form, fetches messages from DB on mount.
- `lib/chat/gemini-client.ts` — `callGemini()` function, wraps Google SDK, implements exponential backoff (5 retries).
- `AIConversation` table — already in schema, stores conversation messages as JSON.

**Two context modes**:
- **"חכם" (default)**: send only the filtered metrics summary + trade list summary (token-efficient)
  - `{ tradeCount, winRate, avgR, expectancy, maxDrawdown, totalPnl, filteredTrades: [{ ticker, direction, actualR, result }, ...] }`
- **"שלח את כל הדאטה"**: send full schema JSON
  - `{ trades: [...full ClosedTrade objects], orders: [...full Order objects] }`
- User toggles mode with a button; persists to localStorage or `User.settings`

**System prompt**: Existing Hebrew persona ("חנן") from Phase 5 handoff. **Move to server** (currently not implemented anywhere).

**Chat history**: 
- `AIConversation.messages` — stores `{ role: 'user' | 'assistant', content: string, createdAt: Date }[]`
- Conversation persists across page refreshes; user can start fresh conversation with a button.

**Error handling**:
- Rate limits (429): retry with exponential backoff
- API errors (4xx/5xx): show user-friendly message, log to stderr
- Parsing errors: graceful fallback

**Important**: Gemini key **never client-side** — API calls go through `/api/chat` (server-side).

### Files to create

- `app/api/chat/route.ts` — POST /api/chat
- `lib/chat/gemini-client.ts` — `callGemini()`, error handling, retries
- `components/chat-sidebar.tsx` — [UPDATE] replace stub with live form + message history
- `__tests__/chat/gemini-client.test.ts` — unit tests for `callGemini()`

### Files to modify

- `app/(dashboard)/layout.tsx` — ensure ChatSidebar is imported, toggle button in place (already done in Phase 5)
- `CLAUDE.md` — add Phase 7 section

---

## Notes for Session 7

1. **Before implementing Phase 7**: Read `CLAUDE.md` (Phase 7 stub section) and this handoff fully.
2. **Gemini SDK**: `npm ls` shows `@google/generative-ai` already installed (v0.x).
3. **System prompt**: Ported from old React app. Use Hebrew, persona named "חנן". Ask user if they want tweaks.
4. **Exponential backoff**: Existing code in Phase 5 used `parseGeminiResponse()` with retries; adapt pattern for server-side.
5. **Two context modes**: Clarify with user which default is better (probably "חכם" for cost reasons).
6. **localStorage persistence**: Consider storing active conversation ID + context mode in localStorage; fetch messages server-side on mount.
7. **DB schema check**: `AIConversation` table exists (created in Phase 2 migrations); `User.settings` is already JSON type for storing preferences.
