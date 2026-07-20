# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Rules live in [`.claude/rules/`](.claude/rules/)** and load automatically each session. This file is reference / documentation — commands, architecture, schema, phase history. If a claim here reads like a "must / must not", it probably belongs in a rules file; move it there.

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

## Architecture

**Trade Analysis** is a Hebrew RTL trading journal with AI assistant ("חנן"), built on Next.js 16 App Router + React 19 + Supabase. Public multi-user SaaS — public signup via `/signup`, RLS at the DB level. See [`.claude/rules/multi-user.md`](.claude/rules/multi-user.md).

### Data flow

```
Supabase Auth → middleware.ts → protected routes → DashboardLayout
                                                   (server, checks session, upserts User row)
                                                   → Header + tab content
```

The dashboard layout (`app/(dashboard)/layout.tsx`) wraps everything in `ChatContextProvider`, and `<ChatSidebar />` is placed **outside** the `overflow-hidden` flex div as a sibling — required so `position: fixed` anchors to the viewport instead of rendering inline.

### Key facts (non-rule reference)

- **Auth**: Supabase email+password with public signup via `/signup`. Post-email-confirmation, the signup page collects profile details before redirecting to `/research`.
- **DB access**: Supabase JS client (`@supabase/ssr` server, `@supabase/supabase-js` browser/scripts). Type safety via the generated `Database` type in `lib/db/types.ts`. The `_prisma_migrations` table is a leftover from initial bootstrap — kept as an audit row, not used by tooling.
- **RTL**: `<html dir="rtl" lang="he">` at root layout. User-facing copy is Hebrew; code/identifiers/comments stay in English.
- **IBKR**: Flex Web Service — 2-step pull (request → download). Token valid ~1 year. Encrypted AES-256-GCM at rest.
- **Single Flex Query**: Only the **Activity** Flex Query is used (Trade Confirmations was dropped). Activity updates once per end-of-day, so cron runs 2×/day at 13:00 & 20:00 UTC. The `flexQueryIdTrades` column is nullable and unused.
- **Massive (formerly Polygon)**: All `lib/polygon` → `lib/massive`, `app/api/polygon` → `app/api/massive`, env var `POLYGON_API_KEY` → `MASSIVE_API_KEY`. **Price sync is currently disabled** (GitHub Actions workflow for massive-prices not added; sync dot removed from `components/sync-indicator.tsx`; settings panel hidden in `app/(dashboard)/settings/page.tsx`). Code paths still exist for re-enabling.
- **Routing**: Default landing is `/research`. `app/page.tsx`, the login page, and the auth callback redirect there. The earlier live open-positions `/dashboard` view was removed in the Phase 3 tech-debt round (T14); if a real-time view is needed again it will be rebuilt from scratch.
- **Nav tabs**: "תחקור" (`/research`) · "חיפוש" (`/search`) · "ייבוא-ידני" (`/manual-import`).
- **Profile/Settings**: unified at `/profile` with sidebar tabs — חשבון / אבטחה / תצוגה / ברוקר. `/settings` redirects to `/profile?tab=broker`.

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
- `Order` columns in use: `id`, `tradeId`, `userId`, `side`, `quantity`, `price`, `commission`, `executedAt`, `brokerExecId`, `brokerOrderId`, `brokerClientAccountId`, `currency`, `orderType`, `netCash`, `commissionCurrency`, `orderTime`, `broker`. Removed in cleanup: `tax`, `tradeDate`, `exchange`, `proceeds`, `brokerTradeId`, `rawPayload` (dropped in P8 of `docs/in-progress/PERFORMANCE-AUDIT.md` — audit trail lives on `BrokerEvent.rawPayload` instead). `broker` was reinstated as an explicit column in P11 (was previously stashed in the now-dropped `rawPayload` blob without any query being able to read it).
- `User` columns: `id`, `email`, `name` (display name = firstName + lastName), `firstName`, `lastName`, `phone`, `addressStreet`, `addressCity`, `addressCountry`, `settings` (Json), `createdAt`. Display preferences (currency, dateFormat, numberFormat, timezone) live in `settings.display` JSON — no dedicated columns. API: `GET/PATCH /api/profile`.
- `BrokerEvent` — raw XML audit log of every IBKR fetch.
- `BrokerConnection.flexTokenEncrypted` — AES-256-GCM. Never returned in API responses.

## Database RPCs

- `reverse_position(...)` — atomic FIFO REVERSAL (close existing position + open opposite-side trade in one Postgres transaction). See [`.claude/rules/reverse-position-rpc.md`](.claude/rules/reverse-position-rpc.md) for the 11-param signature and the guard semantics.

## Admin panel

Private in-app admin surface at `/admin`, gated by the `User.isAdmin` boolean column. Not linked from any public UI — a "מנהל" tab appears in the header only when `isAdmin=true`, and both [app/(dashboard)/admin/layout.tsx](app/(dashboard)/admin/layout.tsx) and [app/(dashboard)/admin/page.tsx](app/(dashboard)/admin/page.tsx) re-check the flag and redirect to `/research` otherwise. RLS additionally lets an admin `SELECT` any `User` row via the `admins_select_all_users` policy (added in migration `add_user_is_admin_column`) so the users list works without service-role reads on the layout gate.

To become an admin: `UPDATE "User" SET "isAdmin"=true WHERE email='…';` via Supabase MCP `execute_sql`. No self-service; the flag is set by the owner directly in Postgres.

Phase 1 exposes a single feature — a users list with a per-row **Free ↔ Pro toggle** (`POST /api/admin/users/[userId]/toggle-tier`). The toggle:
- Runs `requireAdmin()` from [lib/auth/require-admin.ts](lib/auth/require-admin.ts) (401/403 on failure).
- Writes via `createAdminClient()` because billing columns are RLS-protected against authenticated-role writes (migration `harden_user_billing_write_paths`).
- Sets `subscriptionTier` + a **fake** matching `subscriptionStatus` (`active` on upgrade, `cancelled` on downgrade) and `subscriptionRenewsAt` (`now + 30d` on upgrade, `null` on downgrade), so the profile ▸ מנוי tab reads a coherent state.
- **Never touches `lemonsqueezyCustomerId` / `lemonsqueezySubscriptionId`** — a real Lemon Squeezy webhook can still overwrite the fake state cleanly.

Its purpose is manual QA of Pro-gated flows (AI Excel import, chat Pro mode, IBKR connect, activity CSV export, unlimited manual entry) without waiting on a real Lemon Squeezy webhook.

## FIFO logic

`matchExecution` in [lib/trade/fifo.ts](lib/trade/fifo.ts) is a pure function returning a `FifoAction` union (`OPEN | SCALE_IN | REDUCE | CLOSE | REVERSAL`). Persistence + concurrency handling live in [lib/ibkr/process-executions.ts](lib/ibkr/process-executions.ts).

Invariants and concurrency rules are in [`.claude/rules/fifo-invariants.md`](.claude/rules/fifo-invariants.md) and [`.claude/rules/fifo-concurrency.md`](.claude/rules/fifo-concurrency.md).

## IBKR date parsing

IBKR Flex emits `dd/MM/yyyy;HH:mm:ss TimeZone` (e.g. `23/04/2026;14:30:00 EST`). Parsed manually in [lib/ibkr/parse-date.ts](lib/ibkr/parse-date.ts) — see [`.claude/rules/ibkr-date-parsing.md`](.claude/rules/ibkr-date-parsing.md) for why `new Date()` / `date-fns parse()` don't work. Tests in [__tests__/parse-date.test.ts](__tests__/parse-date.test.ts) cover all US zones + DST transitions.

The Flex parser also has a dual-root quirk documented in the same rule file.

## Manual entry pipeline

`ManualLeg` (in [lib/trade/manual-entry.ts](lib/trade/manual-entry.ts)) is the input type for both the form (`/manual-import`) and the Excel import. Fields:

- **Required** (8): `ticker`, `date` (YYYY-MM-DD UTC), `time` (HH:MM UTC), `side`, `quantity`, `price`, `commission`, `currency`
- **Optional order-level** (6): `commissionCurrency`, `orderType`, `orderPlacedDate`, `orderPlacedTime`, `broker`, `timezone` (IANA tz for the date/time fields — defaults to UTC)
- **Optional Trade-level annotations** (6): `setupType`, `emotionalState`, `stopPrice`, `targetPrice`, `notes`, `didRight` (`wouldChange` was removed from open-trade entry — it only makes sense at close and is set via the manual-close flow)

Key implementation details:
- `buildExecution()` populates `commissionCurrency` (falls back to leg `currency`) and `orderTimeIso` (pre-parsed ISO instant, or `null` if the leg didn't provide `orderPlacedDate`) as explicit fields on `NormalizedExecution`. `netCash` is IBKR-only and stays `null` for manual entries. The `broker` and `_manualClose` fields formerly stashed in `rawPayload` are gone — no downstream consumer.
- `extractAnnotations()` strips Order-level fields and returns only Trade-level annotation fields ready for a Supabase `.update()` call.
- The route (`app/api/trades/manual/route.ts`) calls `processExecutions` first (FIFO), then applies annotations to the resulting `tradeId` via the admin client. The persistence half of that flow (FIFO → annotation merge → manual-source tag → `recomputeActualR`) is extracted into `persistManualLegs(legs, userId)` in [lib/trade/persist-manual-legs.ts](lib/trade/persist-manual-legs.ts) (server-only) and reused by the AI-import confirm route. `manualBrokerExecId(leg, i)` in `manual-entry.ts` is the single source of the dedup key — annotation mapping reconstructs it timezone-aware (a leg's non-UTC tz shifts the instant, so the key must apply `localToUtcIso`).

### AI custom-Excel import (Pro)

Pro users upload a **personal** xlsx (arbitrary layout — merged cells, sub-tables, non-standard headers). Gemini maps/extracts it into `ManualLeg[]`; the user reviews an editable preview, and on confirm the legs flow through `persistManualLegs` (same FIFO path as manual entry). See [`docs/`—plan] and the modules under [lib/trade/ai-import/](lib/trade/ai-import/):

- **`sample-workbook.ts`** → dense 2D cell arrays + merged ranges (cap 2000 rows). **`extract.ts`** → Gemini cascade returning a discriminated `AiMapping` (`mode:'mapping'` = deterministic `columnMap`+`transformations`; `mode:'extraction'` = AI-returned legs, chunked for big sheets). `responseMimeType:'application/json'` + Zod validation (no `responseSchema` — more robust for the union). Injectable `call` for tests. **`apply-mapping.ts`** applies a mapping deterministically; **`finalize-legs.ts`** injects the user-chosen timezone and strict-validates. **`process.ts`** orchestrates all four.
- **Timezone is never AI-inferred** — it's a required field at upload (`ExcelImportJob.sourceTimezone`), passed as a hard param to `finalizeLegs`. Excel carries no tz; a guess would break FIFO chronology.
- **Async off-Vercel**: upload route creates a `PENDING` `ExcelImportJob` + stores the file in the private `ai-imports` bucket, returns 202. A GitHub-Actions worker (`scripts/process-ai-import-queue.ts`, run via `tsx`) claims jobs through narrow Vercel proxy endpoints (`/api/cron/ai-import-{claim,status,result}`) — the worker holds **only** `CRON_SECRET`+`GEMINI_API_KEY`+`SITE_URL`, never the service-role key. See the Backfill/cron section.
- IBKR imports set `netCash`/`commissionCurrency`/`orderTimeIso` at parse time in `parse-flex-xml.ts` (camelCase real IBKR takes priority over PascalCase legacy fixtures). `buildOrderInsert` reads these explicit fields directly.

## Backfill / cron behavior

- **Backfill**: async — `POST /api/ibkr/backfill` returns 202; `GET` polls status. Uses `waitUntil()` from `@vercel/functions` (replaced `setImmediate` which was killed by Vercel after response).
- **IBKR cron**: GitHub Actions fires at 13:00 & 20:00 UTC (`.github/workflows/ibkr-sync.yml`). Step 2 polls every 10s up to **4 attempts** (~40s); IBKR typically generates the statement within 1–2 attempts. If IBKR is slow and all 4 attempts fail, `IbkrTransientError` is thrown → `lastSyncAt` is not updated → next cron run retries automatically.
- **Massive price cron**: currently disabled (see Massive note above).
- **AI-import worker** (`.github/workflows/ai-import-worker.yml`): drains up to 5 queued `ExcelImportJob`s per run. Primary trigger is on-demand `repository_dispatch` from the upload route (requires `AI_IMPORT_DISPATCH_TOKEN`/`AI_IMPORT_DISPATCH_REPO` set in Vercel — processes within seconds); a `*/30 * * * *` schedule is only the safety net for a silently-failed dispatch (kept infrequent to save Actions minutes since dispatch handles the common case). `concurrency` guard prevents overlapping drains. Claims are atomic (`claim_excel_import_job()` RPC, `FOR UPDATE SKIP LOCKED`). **AI-import watchdog** (`*/15`): fails jobs stuck in an in-flight state >15 min (`errorMessage='timeout_watchdog'`). **AI-import cleanup** (daily `0 3`): removes uploaded xlsx files for terminal jobs older than 7 days (job row kept as audit). Watchdog + cleanup are curl-to-Vercel like `ibkr-sync.yml`.
- **GitHub Actions secrets for the worker**: `SITE_URL`, `CRON_SECRET`, `GEMINI_API_KEY` — least-privilege, **no** Supabase URL or service-role key on the runner.

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
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN — browser-safe (public). Enables error reporting from both client and server. |
| `SENTRY_AUTH_TOKEN` | Sentry auth token — required only at build time for source-map upload. Server-only. |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key — browser-safe. Powers analytics + signup funnel. |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog cloud host (`https://us.i.posthog.com` by default; `https://eu.i.posthog.com` for EU projects). |
| `LEMONSQUEEZY_API_KEY` | Lemon Squeezy API key for billing |
| `LEMONSQUEEZY_STORE_ID` | Lemon Squeezy store ID |
| `LEMONSQUEEZY_VARIANT_ID_MONTHLY` | LS variant ID for monthly Pro ($14.99/mo) |
| `LEMONSQUEEZY_VARIANT_ID_ANNUAL` | LS variant ID for annual Pro ($149.99/yr) |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | LS webhook signing secret (HMAC-SHA256) |
| `LEMONSQUEEZY_DISCOUNT_CODE_LAUNCH_MONTHLY` | LS discount **code** (not ID) for launch promo monthly ($9.99 × 3mo). Optional — omit after promo ends. The LS checkout API attaches discounts via `checkout_data.discount_code`, not as a `relationships.discount`. |
| `LEMONSQUEEZY_DISCOUNT_CODE_LAUNCH_ANNUAL` | LS discount **code** for launch promo annual ($99.99). Optional — omit after promo ends |
| `AI_IMPORT_DISPATCH_TOKEN` | **Optional.** Fine-grained GitHub PAT (repo access, dispatch) so the AI-Excel-import upload route can `repository_dispatch` the worker for near-instant processing. Server-only. Omit → the `*/5` schedule in `ai-import-worker.yml` handles jobs instead. |
| `AI_IMPORT_DISPATCH_REPO` | **Optional.** `owner/repo` target for the dispatch above. Server-only. Omit with the token to rely on the schedule. |

When adding a new env var, follow [`.claude/rules/env-var-checklist.md`](.claude/rules/env-var-checklist.md).

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

Refactors after Phase 7: Activity-only Flex query + CSV export. Refactor after Phase 8: Polygon→Massive rename + price-sync disabled + `/dashboard` hidden behind `/research` redirects (Phase 5 view; the route and component were then removed entirely in the Phase 3 tech-debt round — see T14). Post-Phase-8 cleanup: IBKR Order columns trimmed (tax/tradeDate/exchange/proceeds/brokerTradeId removed; netCash/commissionCurrency/orderTime properly extracted from rawPayload); manual import expanded to card-based UI with the current ManualLeg field set + updated Excel template. Tech-debt remediation rounds (`docs/TECH-DEBT.md`): xlsx → exceljs swap, multi-user cron iteration, `@supabase/ssr` upgrade with `as any` shim removal, shared close-validation helper + close-route test coverage, concurrency integration tests, research-dashboard 1237 LOC split into 5 modules, `/dashboard` removal.

## QA / testing

[docs/qa-test-user.md](docs/qa-test-user.md) — tracks the dedicated **QA test user** (`yadefam806@ameady.com`) used for pre-launch manual-QA of the manual-entry + research-analytics flows. Documents the test user identity, the current entered dataset + expected research KPIs (regression baseline), bugs found & fixed during QA, operational gotchas (Render cold-start/swap request pile-ups, `brokerExecId` dedup), and ready-to-run reset/verification SQL. Read it before running further experiments on that user.
