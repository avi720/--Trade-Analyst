# Trade Analysis — Handoff to Session 5

**Status**: Phases 0–4 complete. Ready for Phase 5 (Real-Time Dashboard).
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

- **OS**: Windows 11 Pro on **ARM64** (Snapdragon / Surface-class). Node.js at `D:\Program Files\Node` is the **native ARM64** build.
- **Project path**: `D:\avipa\Documents\Programming\‏‏Trade Analyst` (RTL marks in "Trade").
- **Shell**: Git Bash / MINGW64 — `npm` not on PATH there. Use **PowerShell** (`$env:Path = "D:\Program Files\Node;" + $env:Path`) to run npm commands.
- **Windows build fix**: `NEXT_TELEMETRY_DISABLED=1 npm run build` to avoid `EXDEV: cross-device link not permitted` (already in scripts).
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

## Phase 4 — Polygon Price Updates (DONE)

### DB Migration

**`phase4_price_sync_fields`** — adds two fields to `BrokerConnection`:
```sql
ALTER TABLE "BrokerConnection"
  ADD COLUMN "lastPriceSyncAt"     TIMESTAMPTZ,
  ADD COLUMN "lastPriceSyncStatus" TEXT;
```

No other migrations needed (`Trade.lastKnownPrice`, `Trade.lastPriceUpdateAt`, `BrokerConnection.pricePollingIntervalMin` were already in the schema from Phase 2).

### New library code

| File | Purpose |
|------|---------|
| `lib/polygon/client.ts` | `fetchPrices(tickers[])` — calls `GET /v2/snapshot/locale/us/markets/stocks/tickers` (all US market tickers, one call), filters client-side. Returns `Map<ticker, price>`. Uses `lastTrade.p` → falls back to `day.c`. 429 → returns empty Map (no throw). Other errors → throws. |
| `lib/polygon/sync.ts` | `runPriceSync(userId)` — shared logic: load open trades, call `fetchPrices`, update `Trade.lastKnownPrice + lastPriceUpdateAt`. Returns `{ updated, tickers, status }`. Used by both cron and refresh routes. |

**Polygon Snapshot API note**: `/v2/snapshot` does NOT support a `?tickers=` comma-separated batch param. The approach is to fetch all US market tickers (~10k) in one call and filter the response client-side. This uses 1 call/cron run, well within free tier (5 calls/min).

### New API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cron/polygon-prices` | GET | Render Cron Job (secured with `CRON_SECRET`). Skips if `lastPriceSyncAt` is recent. Calls `runPriceSync`, updates `lastPriceSyncAt + lastPriceSyncStatus` on `BrokerConnection`. |
| `/api/polygon/settings` | POST | Saves `pricePollingIntervalMin` for the current user's `BrokerConnection`. Auth: Supabase session. |
| `/api/polygon/refresh` | POST | On-demand price refresh (ignores interval). Auth: Supabase session. Used by Phase 5 dashboard. Calls `runPriceSync` + updates sync timestamps. |

### Updated files

- **`app/api/ibkr/connection/route.ts`** — SELECT now includes `lastPriceSyncAt, lastPriceSyncStatus`. SyncIndicator and settings page use these.
- **`app/(dashboard)/settings/page.tsx`** — Polygon stub replaced with real form: `pricePollingIntervalMin` number input + save button → `POST /api/polygon/settings`. Shows `lastPriceSyncAt + lastPriceSyncStatus` status.
- **`components/sync-indicator.tsx`** — Polygon dot now wired: uses `lastPriceSyncAt` vs `pricePollingIntervalMin` for color (green/amber/red). Tooltip shows full timestamp + status.
- **`render.yaml`** — added second cron job `polygon-prices` (fires every 15 min, same pattern as `ibkr-sync`).
- **`lib/db/types.ts`** — regenerated with `lastPriceSyncAt + lastPriceSyncStatus` on `BrokerConnection`.

### Tests

- `__tests__/polygon-client.test.ts` — 11 tests: batch fetch, lastTrade.p/day.c fallback, missing ticker absent (no error), 429 → empty Map, 500 → throws, empty response, price=0 skipped, case-insensitive matching, missing API key throws.

**Test status: 97/97 pass. Build clean.**

---

## Full Roadmap

| Phase | Content | Status |
|-------|---------|--------|
| 0 | Planning | ✅ Done |
| 1 | Foundation — Next.js + Auth + Layout | ✅ Done |
| 2 | DB Models + FIFO Logic + Tests | ✅ Done (no ORM, Supabase SDK) |
| 3 | IBKR Flex Integration + Cron | ✅ Done |
| 4 | Polygon Price Updates | ✅ Done |
| 5 | Real-Time Dashboard | 🔲 Next |
| 6 | Research Dashboard | 🔲 |
| 7 | AI Chat (Hanan, server-side) | 🔲 |
| 8 | Search + Polish | 🔲 |

---

## Phase 5 — Real-Time Dashboard (NEXT)

From `trade-analysis-prompt.md`:
- Open positions only (Trade.status = 'Open')
- Per-position: ticker, direction, quantity, avg entry price, `lastKnownPrice`, unrealized P&L (absolute + %), current R vs planned risk, time open, setup type
- "מחיר עודכן לפני X דקות" — from `Trade.lastPriceUpdateAt`
- Summary row: total exposure, total unrealized P&L, position count
- IBKR stale banner: amber if `lastSyncAt` exceeded `2 × pollingIntervalMin`
- On-demand price refresh: if `lastPriceSyncAt` is stale (beyond `pricePollingIntervalMin`), trigger `POST /api/polygon/refresh` automatically or via button
- Filters: ticker, setup type, direction, position size, time open, P&L
- AI chat sidebar (חנן) — Phase 7 wires the actual AI, Phase 5 can stub it

Infrastructure ready:
- `POST /api/polygon/refresh` exists — Phase 5 dashboard calls this
- `Trade.lastKnownPrice` + `lastPriceUpdateAt` are populated by Polygon cron
- All open trade data is in Supabase `Trade` table with `status = 'Open'`

**Rule: do not start Phase 5 without explicit approval.**
