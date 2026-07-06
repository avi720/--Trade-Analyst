# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                                  # Dev server (http://localhost:3000)
npm run build                                # Production build (TypeScript gate)
npm run start                                # Start production server
npm run lint                                 # ESLint (next lint)
npm run test                                 # Vitest watch
npm run test:run                             # Vitest once
npm run test:run -- __tests__/fifo.test.ts   # Single file
npm run test:run -- -t "REVERSAL"            # Tests matching name
npm run db:seed                              # Seed DB (uses .env.local + service-role key)
```

DB schema changes go through the Supabase MCP `apply_migration` tool. To regenerate the typed Database client, call MCP `generate_typescript_types` for project `nwvswntqrqqtwzrhzpmi` and write the output to `lib/db/types.ts`.

## Architecture

**Trade Analysis** is a Hebrew RTL trading journal with AI assistant ("חנן"), built on Next.js 16 App Router + React 19 + Supabase.

Multi-user SaaS — public signup via `/signup`. Architecture is multi-user at the DB level: every app table has a `userId` FK and RLS policies of the form `auth.uid() = "userId"` (or `= "id"` on `User`). Do not add single-user shortcuts.

### Data flow

```
Supabase Auth → middleware.ts → protected routes → DashboardLayout
                                                   (server, checks session, upserts User row)
                                                   → Header + tab content
```

The dashboard layout (`app/(dashboard)/layout.tsx`) wraps everything in `ChatContextProvider`, and `<ChatSidebar />` is placed **outside** the `overflow-hidden` flex div as a sibling — required so `position: fixed` anchors to the viewport instead of rendering inline.

### Key design decisions

- **Auth**: Supabase email+password with public signup via `/signup`. Post-email-confirmation, the signup page collects profile details before redirecting to `/research`.
- **DB access**: Supabase JS client (`@supabase/ssr` server, `@supabase/supabase-js` browser/scripts). **No ORM**. Type safety via the generated `Database` type in `lib/db/types.ts`. The `_prisma_migrations` table is a leftover from initial bootstrap — kept as an audit row, not used by tooling.
- **Migrations**: Apply via Supabase MCP `apply_migration`.
- **RLS**: Enabled on every app table. Don't bypass it from request paths — only `lib/supabase/admin.ts` (service-role) skips RLS, and that's reserved for cron jobs and the seed script.
- **RTL**: `<html dir="rtl" lang="he">` at root layout. User-facing copy is Hebrew; code/identifiers/comments stay in English.
- **IBKR**: Flex Web Service — 2-step pull (request → download). Token valid ~1 year. Encrypted AES-256-GCM at rest.
- **Single Flex Query**: Only the **Activity** Flex Query is used (Trade Confirmations was dropped). Activity updates once per end-of-day, so cron runs 2×/day at 13:00 & 20:00 UTC. The `flexQueryIdTrades` column is nullable and unused.
- **Massive (formerly Polygon)**: All `lib/polygon` → `lib/massive`, `app/api/polygon` → `app/api/massive`, env var `POLYGON_API_KEY` → `MASSIVE_API_KEY`. **Price sync is currently disabled** (GitHub Actions workflow for massive-prices not added; sync dot removed from `components/sync-indicator.tsx`; settings panel hidden in `app/(dashboard)/settings/page.tsx`). Code paths still exist for re-enabling.
- **Routing**: Default landing is `/research`. `app/page.tsx`, the login page, and the auth callback redirect there. The earlier live open-positions `/dashboard` view was removed in the Phase 3 tech-debt round (T14); if a real-time view is needed again it will be rebuilt from scratch.
- **Nav tabs**: "תחקור" (`/research`) · "חיפוש" (`/search`) · "ייבוא-ידני" (`/manual-import`).
- **Profile/Settings**: unified at `/profile` with sidebar tabs — חשבון / אבטחה / תצוגה / ברוקר. `/settings` redirects to `/profile?tab=broker`.
- **Base URL**: **Never use `new URL(request.url).origin` to build redirect or callback URLs** — `request.url` in server-side handlers may not reflect the real external URL depending on the hosting environment. Instead call `getBaseUrl()` from `lib/utils.ts`, which returns `SITE_URL` (set in the Vercel dashboard) or `http://localhost:3000` locally. `SITE_URL` is intentionally a server-only env var (no `NEXT_PUBLIC_` prefix) — `getBaseUrl()` is never called from client code. This rule applies anywhere the server needs to produce a fully-qualified external URL: auth callbacks, password-reset links, OAuth redirects, webhook return URLs, payment processor callbacks, etc. Also: always validate that a `next`/redirect path parameter starts with `/` before appending it to `getBaseUrl()` to prevent open-redirect abuse.

### Theme

| Variable | Value | Use |
|---|---|---|
| `--bg-dark` | `#080808` | Page background |
| `--panel-bg` | `#111111` | Panel backgrounds |
| `--border` | `#222222` | Borders |
| `--green` | `#2CC84A` | Win / positive |
| `--red` | `#FF4D4D` | Loss / negative |
| `--amber` | `#FFB800` | Accent / warning |
| `--text-main` | `#E0E0E0` | Primary text |
| `--text-dim` | `#888888` | Secondary text |

Fonts: **IBM Plex Mono** (numbers) + **Assistant** (UI, Hebrew).

## DB schema highlights

- `Trade` + `Order` — FIFO-based. Each execution = one `Order`. A `Trade` aggregates multiple `Order`s.
- `Order.brokerExecId` — UNIQUE. Global idempotency key for IBKR dedup.
- `Order.brokerOrderId` — NOT unique. Groups partial fills.
- `Order` columns in use: `id`, `tradeId`, `userId`, `side`, `quantity`, `price`, `commission`, `executedAt`, `brokerExecId`, `brokerOrderId`, `brokerClientAccountId`, `currency`, `orderType`, `rawPayload`, `netCash`, `commissionCurrency`, `orderTime`. Removed in cleanup: `tax`, `tradeDate`, `exchange`, `proceeds`, `brokerTradeId`.
- `User` columns: `id`, `email`, `name` (display name = firstName + lastName), `firstName`, `lastName`, `phone`, `addressStreet`, `addressCity`, `addressCountry`, `settings` (Json), `createdAt`. Display preferences (currency, dateFormat, numberFormat, timezone) live in `settings.display` JSON — no dedicated columns. API: `GET/PATCH /api/profile`.
- `BrokerEvent` — raw XML audit log of every IBKR fetch.
- `BrokerConnection.flexTokenEncrypted` — AES-256-GCM. Never returned in API responses.

## Database RPCs

- `reverse_position(p_close_trade_id, p_close_status, p_close_at, p_avg_exit_price, p_actual_r, p_result, p_realized_pnl, p_total_commission, p_close_order, p_new_trade, p_new_order)` — atomic FIFO REVERSAL (close existing position + open opposite-side trade in one Postgres transaction). **Always use this 11-param `p_`-prefixed overload**; an older 5-param overload exists from an earlier attempt and must not be used. The close UPDATE is **guarded** — it only fires when the trade is still `status='Open'` AND its `totalQuantity` still equals `p_close_order.quantity` (the open size the caller matched against). On mismatch it raises `reverse_position_conflict`, which `process-executions.ts` catches as a retryable concurrency conflict. Don't change the 11-param signature to add a guard param — the guard reuses the existing `p_close_order` quantity.

## FIFO logic — invariants

- `matchExecution(exec, openTrade)` (in `lib/trade/fifo.ts`) returns a `FifoAction` discriminated union: `OPEN | SCALE_IN | REDUCE | CLOSE | REVERSAL`.
- All arithmetic uses plain `number`. Postgres NUMERIC columns come back from Supabase as `number`.
- **REVERSAL** produces two DB writes — callers MUST persist them via `supabase.rpc('reverse_position', { ... })` so they happen atomically.
- `rDistribution` uses left-inclusive bins `[min, max)`. r=0 → "0R–1R", r=2 → ">2R".
- `actualR` is null when `stopPrice` is null OR `riskPerShare < 0.0001` (prevents Infinity/NaN).
- **Concurrency (single-user, same-ticker).** The FIFO read→match→write in `processExecutions` is not atomic, so two overlapping requests for the same `(userId, ticker)` could race (the "orphaned Open rows under request pile-up" QA symptom). Two safeguards make it self-correcting — across users there is never contention (separate rows + RLS):
  1. **Partial unique index** `Trade_userId_ticker_open_unique` on `("userId", ticker) WHERE status='Open'` — enforces the "≤1 open trade per user+ticker" invariant the FIFO read (`.eq('status','Open').maybeSingle()`) already assumes. A duplicate concurrent OPEN fails with `23505` instead of corrupting data.
  2. **Optimistic-concurrency retry** in `process-executions.ts`: every mutating path is guarded — OPEN catches `23505`; SCALE_IN/REDUCE/CLOSE add `.eq('status','Open').eq('totalQuantity', <readValue>).select('id')` and treat a 0-row result as a conflict; REVERSAL detects `reverse_position_conflict`. On a `ConflictError` the per-execution loop re-reads the latest open trade and re-runs `matchExecution` (up to `MAX_PERSIST_ATTEMPTS=4` with small backoff), so a racing OPEN becomes a SCALE_IN on the next pass. Genuine (non-conflict) DB errors fail immediately and are never retried.

## IBKR date parsing (CRITICAL)

IBKR Flex uses `dd/MM/yyyy;HH:mm:ss TimeZone` (e.g., `23/04/2026;14:30:00 EST`). `new Date()` cannot parse this; `date-fns parse()` won't work either because it builds dates in the local timezone. Use manual component parsing + `Date.UTC()` — see [lib/ibkr/parse-date.ts](lib/ibkr/parse-date.ts). Tests in [__tests__/parse-date.test.ts](__tests__/parse-date.test.ts) cover all US zones (EST/EDT/CST/CDT/PST/PDT) + DST transitions.

The Flex parser also has a dual-root quirk: real Activity XML uses camelCase fields (`ibExecID`, `tradePrice`, …) wrapped in `FlexQueryResponse`, while older fixtures use PascalCase. `lib/ibkr/parse-flex-xml.ts` resolves both via `resolveStatement()` and falls back `PascalCase ?? camelCase` per field.

## Manual entry pipeline

`ManualLeg` (in `lib/trade/manual-entry.ts`) is the input type for both the form (`/manual-import`) and the Excel import. Fields:

- **Required** (8): `ticker`, `date` (YYYY-MM-DD UTC), `time` (HH:MM UTC), `side`, `quantity`, `price`, `commission`, `currency`
- **Optional order-level** (5): `commissionCurrency`, `orderType`, `orderPlacedDate`, `orderPlacedTime`, `broker`
- **Optional Trade-level annotations** (7): `setupType`, `emotionalState`, `stopPrice`, `targetPrice`, `notes`, `didRight`, `wouldChange`

Key invariants:
- `buildExecution()` always sets `rawPayload.ibCommissionCurrency` (falls back to `currency`); also stores `_manualOrderTime` and `broker` when provided.
- **`_manualOrderTime` pattern**: manual entries pre-parse `orderPlacedDate/Time` into an ISO string and store it as `rawPayload._manualOrderTime`. `buildOrderInsert` detects this key and uses it directly, bypassing IBKR date parsing. Do NOT remove this field from rawPayload.
- `extractAnnotations()` strips Order-level fields and returns only Trade-level annotation fields ready for a Supabase `.update()` call.
- The route (`app/api/trades/manual/route.ts`) calls `processExecutions` first (FIFO), then applies annotations to the resulting `tradeId` via the admin client.
- IBKR imports set `netCash`/`commissionCurrency`/`orderTime` from `rawPayload` in `buildOrderInsert`; camelCase fields take priority over PascalCase (e.g., `raw.netCash ?? raw.NetCash`).

## Supabase typing workaround

`@supabase/ssr` v0.6.x's `createServerClient<Database>` does not propagate the `Database` generic to `from()`/`upsert()` callsites — TS narrows `values` to `never`. The runtime is fine. Workaround: `lib/supabase/server.ts` casts the return to `SupabaseClient<Database>`. Remove the cast once upstream is fixed.

## Backfill / cron behavior

- **Backfill**: async — `POST /api/ibkr/backfill` returns 202; `GET` polls status. Uses `waitUntil()` from `@vercel/functions` (replaced `setImmediate` which was killed by Vercel after response).
- **IBKR cron**: GitHub Actions fires at 13:00 & 20:00 UTC (`.github/workflows/ibkr-sync.yml`). Step 2 polls every 10s up to **4 attempts** (~40s); IBKR typically generates the statement within 1–2 attempts. If IBKR is slow and all 4 attempts fail, `IbkrTransientError` is thrown → `lastSyncAt` is not updated → next cron run retries automatically.
- **Massive price cron**: currently disabled (see Massive note above).

## Env vars

The required names are listed in `.env.example` (do not commit values). Brief purpose:

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser-safe) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser-safe, RLS-bound) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-only, bypasses RLS |
| `DATABASE_URL` / `DIRECT_URL` | Supabase Postgres connection strings (pgbouncer + direct) |
| `FLEX_TOKEN_ENCRYPTION_KEY` | 64-char hex — AES-256-GCM key for IBKR Flex token at rest |
| `MASSIVE_API_KEY` | Massive API key (price data; sync currently disabled) |
| `GEMINI_API_KEY` | Google Gemini API key for the chat assistant |
| `CRON_SECRET` | Bearer token expected by cron endpoints (`/api/cron/*`) |
| `SITE_URL` | Canonical external URL of the app; used by `getBaseUrl()` (`lib/utils.ts`) to build server-side redirects and callbacks. Set in Vercel dashboard (e.g. `https://trade-analyst-lyart.vercel.app`). Server-only (no `NEXT_PUBLIC_` prefix). Not needed locally. |
| `LEMONSQUEEZY_API_KEY` | Lemon Squeezy API key for billing |
| `LEMONSQUEEZY_STORE_ID` | Lemon Squeezy store ID |
| `LEMONSQUEEZY_VARIANT_ID_MONTHLY` | LS variant ID for monthly Pro ($14.99/mo) |
| `LEMONSQUEEZY_VARIANT_ID_ANNUAL` | LS variant ID for annual Pro ($149.99/yr) |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | LS webhook signing secret (HMAC-SHA256) |
| `LEMONSQUEEZY_DISCOUNT_CODE_LAUNCH_MONTHLY` | LS discount **code** (not ID) for launch promo monthly ($9.99 × 3mo). Optional — omit after promo ends. The LS checkout API attaches discounts via `checkout_data.discount_code`, not as a `relationships.discount`. |
| `LEMONSQUEEZY_DISCOUNT_CODE_LAUNCH_ANNUAL` | LS discount **code** for launch promo annual ($99.99). Optional — omit after promo ends |

If you add a new env var, add the **name** to `.env.example` and document its purpose here.

## Phase history

The project shipped in eight phases plus several post-Phase-8 refactors. The **invariants** that survive each phase have been pulled into the sections above; the phase logs themselves were not persisted as separate files — read them out of git history when needed:

```bash
git log --oneline --reverse main          # all phase commits in order
git log --grep='Phase'                    # commits that named a phase
git log --all --oneline -- lib/trade/     # FIFO evolution (Phase 2)
git log --all --oneline -- lib/ibkr/      # IBKR Flex integration (Phase 3)
git log --all --oneline -- lib/massive/   # Massive (formerly Polygon) price sync (Phase 4)
git log --all --oneline -- components/research-dashboard.tsx  # Research dashboard (Phase 6)
git log --all --oneline -- lib/chat/      # Chat sidebar "חנן" (Phase 7)
git log --all --oneline -- components/trade-search.tsx components/trade-excel-import.tsx  # Search + manual / Excel (Phase 8)
```

| Phase | Scope |
|---|---|
| 1 | Bootstrap + auth + layout |
| 2 | DB models + FIFO logic |
| 3 | IBKR Flex Web Service integration |
| 4 | Polygon (now Massive) price sync |
| 5 | Real-time open-positions dashboard (now hidden) |
| 6 | Research dashboard (analytics + charts) |
| 7 | AI chat sidebar "חנן" (Gemini) |
| 8 | Trade search + soft-field editing + manual / Excel import |

Refactors after Phase 7: Activity-only Flex query + CSV export. Refactor after Phase 8: Polygon→Massive rename + price-sync disabled + `/dashboard` hidden behind `/research` redirects (Phase 5 view; the route and component were then removed entirely in the Phase 3 tech-debt round — see T14). Post-Phase-8 cleanup: IBKR Order columns trimmed (tax/tradeDate/exchange/proceeds/brokerTradeId removed; netCash/commissionCurrency/orderTime properly extracted from rawPayload); manual import expanded to card-based UI with 20 ManualLeg fields + updated Excel template. Tech-debt remediation rounds (`docs/TECH-DEBT.md`): xlsx → exceljs swap, multi-user cron iteration, `@supabase/ssr` upgrade with `as any` shim removal, shared close-validation helper + close-route test coverage, concurrency integration tests, research-dashboard 1237 LOC split into 5 modules, `/dashboard` removal.

## QA / testing

[docs/qa-test-user.md](docs/qa-test-user.md) — tracks the dedicated **QA test user** (`yadefam806@ameady.com`) used for pre-launch manual-QA of the manual-entry + research-analytics flows. Documents the test user identity, the current entered dataset + expected research KPIs (regression baseline), bugs found & fixed during QA, operational gotchas (Render cold-start/swap request pile-ups, `brokerExecId` dedup), and ready-to-run reset/verification SQL. Read it before running further experiments on that user.
