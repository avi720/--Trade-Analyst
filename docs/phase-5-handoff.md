# Trade Analysis — Handoff to Session 6

**Status**: Phases 0–5 complete. Ready for Phase 6 (Research Dashboard).
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

## Phase 5 — Real-Time Dashboard (DONE)

### Architecture

**Server Component + `router.refresh()` pattern** — no new API route for data fetching:
- `app/(dashboard)/dashboard/page.tsx` — async server component; queries Supabase directly (RLS-safe) for open trades + BrokerConnection; passes data as props.
- `components/open-positions-dashboard.tsx` — client component; handles filters, auto-refresh trigger, manual refresh.
- On refresh: `POST /api/polygon/refresh` → `router.refresh()` — server component re-runs, data updates.

### New files

| File | Purpose |
|------|---------|
| `lib/utils/position-calc.ts` | Pure functions: `unrealizedPnl`, `unrealizedPct`, `currentR`, `exposure`, `relativeTimeHe`, `formatUsd`, `formatR` |
| `components/open-positions-dashboard.tsx` | Main client component: filters, summary cards, positions table, auto-refresh |
| `components/chat-sidebar.tsx` | Stub AI sidebar — opens/closes panel, disabled input. Phase 7 wires actual AI. |
| `__tests__/position-calc.test.ts` | 24 unit tests: long/short P&L, R with/without stop, null guards, division safety |

### Modified files

| File | Change |
|------|--------|
| `app/(dashboard)/dashboard/page.tsx` | Replaced stub with server component fetching open trades + BrokerConnection |

### Dashboard features

- **Positions table**: ticker, direction (Long/Short badge), quantity, avg entry, current price, unrealized P&L ($+%), current R, time open, setup type, price update time
- **Summary cards** (3): position count, total exposure, total unrealized P&L (green/red)
- **IBKR stale banner**: amber if `lastSyncAt > 2 × pollingIntervalMin`
- **4 client-side filters**: ticker (text), direction (all/Long/Short), setup type (dropdown of existing setups), P&L (all/profit/loss)
- **Auto-refresh**: on mount, checks if `lastPriceSyncAt > pricePollingIntervalMin`; if stale, fires `POST /api/polygon/refresh` silently
- **Manual refresh button**: "עדכן מחירים" with spinner
- **Chat sidebar toggle**: "חנן ▶" button opens Phase 7 stub panel

### Tests

**Test status: 121/121 pass. Build clean.**

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
| 6 | Research Dashboard | 🔲 Next |
| 7 | AI Chat (חנן, server-side) | 🔲 |
| 8 | Search + Polish + CSV/Excel Export | 🔲 |

---

## Phase 6 — Research Dashboard (NEXT)

From `trade-analysis-prompt.md`:

**Closed trades only** (`Trade.status = 'Closed'`).

**Metrics** — from existing `calcStats()` in `lib/utils/calculations.ts`:
- win rate, avg R, avg win, avg loss, profit factor, expectancy, max drawdown, total P&L, trade count

**Charts** (Recharts) — user selects which to display:
- Equity curve (`equityCurve()`)
- R distribution histogram (`rDistribution()`)
- Setup performance bar chart (`setupPerformance()`)
- P&L by ticker/sector
- Hold time vs R scatter
- P&L by day-of-week / hour

**User chooses which charts to show** — recommend `react-grid-layout` (draggable/resizable) or simpler checkbox toggle menu. Present options and wait for approval before building.

**Filters**: date range, ticker, setup type, direction, result, execution quality, hold time duration.

**AI chat sidebar** — same `ChatSidebar` stub from Phase 5 (already wired in layout, just import).

**Two AI context modes** (stub in Phase 6, wired in Phase 7):
- "חכם" (default) — filtered metrics summary only (token-efficient)
- "שלח את כל הדאטה" — full trade+order JSON to Gemini context

**Export**: CSV/Excel deferred to Phase 8.

### Infrastructure already available

- `lib/utils/calculations.ts` — `calcStats`, `equityCurve`, `rDistribution`, `setupPerformance` — all ready, no changes needed
- `types/trade.ts` — `ClosedTrade` interface — what `calcStats` expects
- `Trade` table with all needed fields: `actualR`, `realizedPnl`, `result`, `setupType`, `direction`, `openedAt`, `closedAt`, `executionQuality`
- `ChatSidebar` component already built

### Key question before building Phase 6

**Chart layout UX**: `react-grid-layout` (draggable tiles, like a Bloomberg terminal) vs. a simple "show/hide chart" checkbox menu. This changes the complexity significantly — ask before implementing.

**Rule: do not start Phase 6 without explicit approval.**
