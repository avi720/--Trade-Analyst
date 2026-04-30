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

**Trade Analysis** is a Hebrew RTL trading journal with AI assistant ("חנן"), built on Next.js 14 App Router + Supabase.

Currently deployed as single-user (no signup UI — account is created manually in the Supabase dashboard). **The future plan is SaaS with public signup**, so the architecture is already multi-user ready at the DB level: every app table has a `userId` FK and RLS policies of the form `auth.uid() = "userId"` (or `= "id"` on `User`). Do not add single-user shortcuts that would break a multi-user rollout.

### Data flow

```
Supabase Auth → middleware.ts → protected routes → DashboardLayout
                                                   (server, checks session, upserts User row)
                                                   → Header + tab content
```

The dashboard layout (`app/(dashboard)/layout.tsx`) wraps everything in `ChatContextProvider`, and `<ChatSidebar />` is placed **outside** the `overflow-hidden` flex div as a sibling — required so `position: fixed` anchors to the viewport instead of rendering inline.

### Key design decisions

- **Auth**: Supabase email+password. Login page only — no signup. Manual account provisioning in Supabase dashboard.
- **DB access**: Supabase JS client (`@supabase/ssr` server, `@supabase/supabase-js` browser/scripts). **No ORM**. Type safety via the generated `Database` type in `lib/db/types.ts`. The `_prisma_migrations` table is a leftover from initial bootstrap — kept as an audit row, not used by tooling.
- **Migrations**: Apply via Supabase MCP `apply_migration`.
- **RLS**: Enabled on every app table. Don't bypass it from request paths — only `lib/supabase/admin.ts` (service-role) skips RLS, and that's reserved for cron jobs and the seed script.
- **RTL**: `<html dir="rtl" lang="he">` at root layout. User-facing copy is Hebrew; code/identifiers/comments stay in English.
- **IBKR**: Flex Web Service — 2-step pull (request → download). Token valid ~1 year. Encrypted AES-256-GCM at rest.
- **Single Flex Query**: Only the **Activity** Flex Query is used (Trade Confirmations was dropped). Activity updates once per end-of-day, so cron runs 2×/day at 08:00 & 20:00 UTC. The `flexQueryIdTrades` column is nullable and unused.
- **Massive (formerly Polygon)**: All `lib/polygon` → `lib/massive`, `app/api/polygon` → `app/api/massive`, env var `POLYGON_API_KEY` → `MASSIVE_API_KEY`. **Price sync is currently disabled** (`render.yaml` cron commented out; sync dot removed from `components/sync-indicator.tsx`; settings panel hidden in `app/(dashboard)/settings/page.tsx`). Code paths still exist for re-enabling.
- **Routing**: `/dashboard` is hidden — all entry points (`app/page.tsx`, `middleware.ts`, login, auth callback) redirect to `/research`. The dashboard component code is kept, not deleted.
- **Nav tabs**: "תחקור" (`/research`) · "חיפוש" (`/search`) · "ייבוא-ידני" (`/manual-import`).

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
- `BrokerEvent` — raw XML audit log of every IBKR fetch.
- `BrokerConnection.flexTokenEncrypted` — AES-256-GCM. Never returned in API responses.

## Database RPCs

- `reverse_position(p_close_trade_id, p_close_status, p_close_at, p_avg_exit_price, p_actual_r, p_result, p_realized_pnl, p_total_commission, p_close_order, p_new_trade, p_new_order)` — atomic FIFO REVERSAL (close existing position + open opposite-side trade in one Postgres transaction). **Always use this 11-param `p_`-prefixed overload**; an older 5-param overload exists from an earlier attempt and must not be used.

## FIFO logic — invariants

- `matchExecution(exec, openTrade)` (in `lib/trade/fifo.ts`) returns a `FifoAction` discriminated union: `OPEN | SCALE_IN | REDUCE | CLOSE | REVERSAL`.
- All arithmetic uses plain `number`. Postgres NUMERIC columns come back from Supabase as `number`.
- **REVERSAL** produces two DB writes — callers MUST persist them via `supabase.rpc('reverse_position', { ... })` so they happen atomically.
- `rDistribution` uses left-inclusive bins `[min, max)`. r=0 → "0R–1R", r=2 → ">2R".
- `actualR` is null when `stopPrice` is null OR `riskPerShare < 0.0001` (prevents Infinity/NaN).

## IBKR date parsing (CRITICAL)

IBKR Flex uses `dd/MM/yyyy;HH:mm:ss TimeZone` (e.g., `23/04/2026;14:30:00 EST`). `new Date()` cannot parse this; `date-fns parse()` won't work either because it builds dates in the local timezone. Use manual component parsing + `Date.UTC()` — see [lib/ibkr/parse-date.ts](lib/ibkr/parse-date.ts). Tests in [__tests__/parse-date.test.ts](__tests__/parse-date.test.ts) cover all US zones (EST/EDT/CST/CDT/PST/PDT) + DST transitions.

The Flex parser also has a dual-root quirk: real Activity XML uses camelCase fields (`ibExecID`, `tradePrice`, …) wrapped in `FlexQueryResponse`, while older fixtures use PascalCase. `lib/ibkr/parse-flex-xml.ts` resolves both via `resolveStatement()` and falls back `PascalCase ?? camelCase` per field.

## Supabase typing workaround

`@supabase/ssr` v0.6.x's `createServerClient<Database>` does not propagate the `Database` generic to `from()`/`upsert()` callsites — TS narrows `values` to `never`. The runtime is fine. Workaround: `lib/supabase/server.ts` casts the return to `SupabaseClient<Database>`. Remove the cast once upstream is fixed.

## Backfill / cron behavior

- **Backfill**: async — `POST /api/ibkr/backfill` returns 202; `GET` polls status. Uses `setImmediate`, which works on Render's persistent Node process but **not** on Vercel serverless.
- **IBKR cron**: Render fires at 08:00 & 20:00 UTC. The endpoint also enforces `pollingIntervalMin` internally and skips early calls.
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
| `NEXTAUTH_URL` | Production base URL (Render). Not needed for local dev. |

If you add a new env var, add the **name** to `.env.example` and document its purpose here.

## Phase history

Detailed phase build logs (file-by-file changes, test counts, decisions in flight) live in `docs/`. The **invariants** that survive each phase have been pulled into the sections above; the build logs are reference material only.

| Phase | Scope | Handoff |
|---|---|---|
| 1 | Bootstrap + auth + layout | [docs/phase-1-handoff.md](docs/phase-1-handoff.md) |
| 2 | DB models + FIFO logic | [docs/phase-2-handoff.md](docs/phase-2-handoff.md) |
| 3 | IBKR Flex Web Service integration | [docs/phase-3-handoff.md](docs/phase-3-handoff.md) |
| 4 | Polygon (now Massive) price sync | [docs/phase-4-handoff.md](docs/phase-4-handoff.md) |
| 5 | Real-time open-positions dashboard (now hidden) | [docs/phase-5-handoff.md](docs/phase-5-handoff.md) |
| 6 | Research dashboard (analytics + charts) | [docs/phase-6-handoff.md](docs/phase-6-handoff.md) |
| 7 | AI chat sidebar "חנן" (Gemini) | [docs/phase-7-handoff.md](docs/phase-7-handoff.md) |
| 8 | Trade search + soft-field editing + manual / Excel import | [docs/phase-8-handoff.md](docs/phase-8-handoff.md) |

Refactors after Phase 7: Activity-only Flex query + CSV export. Refactor after Phase 8: Polygon→Massive rename + price-sync disabled + `/dashboard` hidden behind `/research` redirects.
