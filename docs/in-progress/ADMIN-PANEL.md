# Admin section — Rollout plan (Phases 1–4)

> **Status:** 🟡 ACTIVE — Phases 1–3 shipped (2026-07-20, 2026-07-22, 2026-07-22). Phase 4 pending.

## Overview

Private in-app admin surface at `/admin`, gated by the `User.isAdmin` boolean and RLS. Built out incrementally so each phase is independently shippable and verifiable. The plan is deliberately owner-scoped — no impersonation, no destructive actions on live billing state, no user data mutation outside the toggle. Everything mutating goes through `requireAdmin()` + `createAdminClient()`.

Phase map:

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Users list + Free/Pro tier toggle | ✅ Shipped 2026-07-20 (commit `5cde705`) |
| **Phase 2** | AI-import jobs viewer + reset/delete | ✅ Shipped 2026-07-22 |
| **Phase 3** | IBKR sync trigger + BrokerEvent viewer (C6 reprocess dropped by owner decision 2026-07-22) | ✅ Shipped 2026-07-22 |
| **Phase 4** | System health dashboard (metrics + recent errors + charts) | ⏳ Planned |

Intentionally **not** planned: user impersonation (Supabase Auth session-swap is high-blast-radius; not worth building until there is a real support workflow demanding it). Kept as a Phase 5 candidate if the need surfaces.

## Global design principles (apply to every phase)

- **Gating source of truth = `User.isAdmin`**, checked in three layers per admin route: layout redirect, page-level belt-and-braces check, and route-handler `requireAdmin()`.
- **All admin API writes go through `createAdminClient()`** — matches the webhook write pattern in `app/api/billing/webhook/route.ts:130-138`. Never import the admin client into a code path that trusts a user request without `requireAdmin()`.
- **Read paths that need to see billing/private columns also use `createAdminClient()`** since `harden_user_billing_write_paths` also revokes column-level SELECTs from the authenticated role. This is why Phase 1's users list uses service-role even for read.
- **RLS grows additively** — each phase adds an `admins_select_all_*` policy for its new table, all keyed on the `SECURITY DEFINER public.is_admin(uuid)` helper introduced in Phase 1 (needed to break the recursion the naive `EXISTS(SELECT ... FROM "User")` form causes).
- **RTL / Hebrew for user-facing copy**, English for code / identifiers / comments (per `.claude/rules/rtl-and-language.md`).
- **`/execute-work-plan`-driven** — every item is a checkbox with a Where / Issue / Acceptance triplet. Complete + verify + tick before the next item.

---

## Phase 1 — Users list + Pro/Free toggle (✅ SHIPPED 2026-07-20)

> Kept in this document as an as-built record so future readers can see the shape of Phase 1 landing and the conventions later phases build on. Phase 1 code lives in commit `5cde705` on `main`; every checkbox was ticked at ship-time and is preserved below as historical truth.

### Context

The app had no admin surface. As the owner I needed a private, in-app way to flip my own (and my QA test user's) `subscriptionTier` between `Free` and `Pro` on demand so I could verify Pro-gated flows (AI Excel import, chat, IBKR connect, activity CSV export, manual entry, trades import) without waiting on a real Lemon Squeezy webhook. A basic users list gives context so I can choose which account to flip.

Phase 1 scope, per user selection:
- **Users list** — read-only table of all Users with the fields relevant to plan state.
- **Toggle Pro/Free** — a per-row action that flips `subscriptionTier` on the selected user.

Deferred out of Phase 1 (see Phases 2/3/4 below): AI-import jobs viewer, IBKR sync trigger + BrokerEvent viewer, system health.

### Phase 1 design decisions

- Gating source of truth = new `User.isAdmin` boolean column, enforced in three places: layout redirect, header tab visibility, and every admin API route.
- Admin writes go through `createAdminClient()` — billing columns are RLS-protected against user-role writes (migration `20260707190000_harden_user_billing_write_paths`).
- Reuse existing patterns — layout gate copies `app/(dashboard)/layout.tsx:13-27`; header conditional prop mirrors how `userEmail` is threaded today.
- Consistency of billing fields on toggle — flipping only `subscriptionTier` leaves the billing UI in an inconsistent state (`components/profile/tab-billing.tsx` reads `subscriptionStatus`). The toggle also writes a matching fake `subscriptionStatus` and `subscriptionRenewsAt`. It intentionally does **not** touch `lemonsqueezyCustomerId` / `lemonsqueezySubscriptionId` — a real webhook can still overwrite the fake state cleanly.

### Phase 1 items

- [x] **A1. Schema — add `isAdmin` column + `admins_select_all_users` RLS policy.** Shipped via Supabase MCP migrations `add_user_is_admin_column` and (recursion fix) `fix_admin_select_policy_recursion`, which introduced `public.is_admin(uid uuid) SECURITY DEFINER STABLE`. Owner flipped via `UPDATE "User" SET "isAdmin"=true WHERE email='avi.paz159@gmail.com'`. Types regenerated in [lib/db/types.ts](../../lib/db/types.ts).
- [x] **A2. `lib/auth/require-admin.ts`** — server-only helper. Throws typed `AdminAuthError`; `adminAuthErrorResponse()` maps to 401/403 `NextResponse`.
- [x] **A3. `app/(dashboard)/admin/layout.tsx`** — server-side gate mirroring the auth+redirect pattern from the parent `(dashboard)/layout.tsx`.
- [x] **A4. Header — conditional "מנהל" tab** ([components/header.tsx](../../components/header.tsx)) + [`app/(dashboard)/layout.tsx`](../../app/(dashboard)/layout.tsx) extended `User.select()` with `isAdmin` and threads through to `<Header isAdmin>`.
- [x] **A5. `app/(dashboard)/admin/page.tsx`** — RSC re-checks the gate and fetches the users list via `createAdminClient()`.
- [x] **A6. `components/admin/admin-users-table.tsx`** — client component with optimistic Free↔Pro toggle and server-truth reconciliation.
- [x] **A7. `POST /api/admin/users/[userId]/toggle-tier`** — `requireAdmin()` → read+flip → write fake `subscriptionStatus` (`active`/`cancelled`) and `subscriptionRenewsAt` (`now+30d`/`null`), never touching LS IDs.
- [x] **A8. Docs — CLAUDE.md admin section** — added between "Database RPCs" and "FIFO logic".

### Phase 1 verifications (all confirmed 2026-07-20)

- [x] V1. `npm run build` clean after migration + type regen.
- [x] V2. QA user has no "מנהל" tab; `GET /admin` → 307 → `/research`.
- [x] V3. Admin sees the tab; `/admin` renders users list with badges for admin rows.
- [x] V4. Free↔Pro round-trip persists in DB and toggles `/manual-import` gating.
- [x] V5. `/profile?tab=billing` reflects the fake status/renewsAt consistently.
- [x] V6. Non-admin `POST /api/admin/users/.../toggle-tier` → 403.
- [x] V7. `execute_sql` after each toggle: `lemonsqueezyCustomerId` / `lemonsqueezySubscriptionId` untouched.

### Phase 1 housekeeping (closed)

- ~~Move this plan file to `docs/completed/admin-phase-1.md`~~ — **skipped per user instruction (2026-07-20)**: user explicitly asked not to move the file to `docs/completed` in this session, overriding the `feedback-completed-audits-move` convention. Later confirmed the plan should stay put and grow with Phases 2–4 in the same document.

---

## Phase 2 — AI-import jobs viewer

### Context

Pro users upload personal xlsx files that a Gemini-driven worker maps and extracts into `ManualLeg[]`s ([lib/trade/ai-import/](../../lib/trade/ai-import/)). The queue is off-Vercel — a GitHub-Actions worker (`.github/workflows/ai-import-worker.yml`) drains up to 5 jobs per run, primarily kicked by on-demand `repository_dispatch` from the upload route and secondarily by a `*/30` safety-net schedule. Users see their own jobs at `/manual-import` (via `GET /api/trades/ai-import`) but there is no owner-side view of the full `ExcelImportJob` queue.

When a job hangs or dies with an obscure error there is nothing but Supabase SQL to poke at. Phase 2 gives the owner a table across all users' jobs plus two mechanical recoveries: **reset** (put a broken/orphaned job back into `PENDING` so the worker re-claims it) and **delete** (drop the row + the xlsx from storage for junk uploads).

### Phase 2 design decisions

- **Introduce admin sub-tabs.** Phase 1 shipped a single-topic `/admin`; Phase 2 grows to two topics (users, jobs). The Phase 1 note "When Phase 2 adds jobs/BrokerEvent viewers, we'll lift `components/profile/profile-layout.tsx:40-190` into `components/admin/admin-layout.tsx` then" is the concrete design commitment: mirror the RTL vertical-sidebar tablist pattern. Same URL-driven activation, same aria-tablist keyboard handling.
- **Migrate users list to `/admin/users`.** `/admin` becomes a redirect to `/admin/users` so the header "מנהל" tab keeps working. Users table logic is preserved verbatim — this is a route move, not a rewrite.
- **Jobs list uses `createAdminClient()`** for the initial SSR fetch (needs to see all users' jobs, join to `User.email`). Reset and delete endpoints use it too; RLS on `ExcelImportJob` gets an additive `admins_select_all_excel_import_jobs` policy for parity when the owner wants to poke via SQL through the app's auth session.
- **Reset semantics = requeue.** Reset sets `status='PENDING'`, `errorMessage=null`, `updatedAt=now`. The next worker drain (`*/30` schedule or dispatch) will re-claim the row through `claim_excel_import_job()` RPC (`FOR UPDATE SKIP LOCKED`). Reset does NOT re-fire `repository_dispatch` — that requires an owner-side GitHub PAT the app doesn't hold. The `*/30` cadence is fine for owner-driven recovery.
- **Delete removes both DB row and the xlsx from storage.** The `ai-imports` bucket is private + user-scoped by RLS; the admin client bypasses that. Order: storage delete first (best-effort log-and-continue), then row delete. If the row lingers after a storage failure it can be re-deleted; leaving orphan bytes with no row would be harder to detect later.

### Phase 2 items

- [x] **B1. Migration — RLS policy: admins can SELECT any `ExcelImportJob`.**
  - **Where:** New Supabase MCP migration `add_admins_select_excel_import_jobs_policy` + regenerated [lib/db/types.ts](../../lib/db/types.ts).
  - **Issue:** Currently `ExcelImportJob` RLS is `userId = auth.uid()`. The admin SSR fetch bypasses this via service-role, but any code path that legitimately runs under the authenticated role (say, a future `/admin/jobs` sub-panel that pings a helper as the admin) would silently see zero rows.
  - **Acceptance:** New policy `admins_select_all_excel_import_jobs FOR SELECT TO authenticated USING (public.is_admin((SELECT auth.uid())))` exists in `pg_policies`. Types regenerated. `npm run build` clean.

- [x] **B2. Admin sub-tabs shell — `components/admin/admin-layout.tsx` (new).**
  - **Where:** New `components/admin/admin-layout.tsx` client component; new server helper file if a fetch of `isAdmin` metadata is needed by the shell (unlikely — the parent gate already ran).
  - **Issue:** With ≥2 admin sub-pages, a shared tablist keeps the "מנהל" header tab as the single entry point. Duplicating the header once per sub-page is bad for consistency and for adding future tabs cheaply.
  - **Acceptance:** RTL vertical sidebar mirrors [components/profile/profile-layout.tsx:40-190](../../components/profile/profile-layout.tsx). Tabs (as of Phase 2): "משתמשים", "ייבוא AI". URL-driven active state (`pathname` matches `/admin/users` or `/admin/jobs`). Keyboard navigation (`ArrowUp/Down/Home/End`, `role=tablist aria-orientation=vertical`) works. Verified by tabbing through with a screen reader and hearing each tab label.

- [x] **B3. Refactor Phase 1 users list into `/admin/users`.**
  - **Where:** Move current [app/(dashboard)/admin/page.tsx](../../app/(dashboard)/admin/page.tsx) contents into `app/(dashboard)/admin/users/page.tsx`. Replace the original with a `redirect('/admin/users')`.
  - **Issue:** The Phase 1 users list occupies `/admin` root. With sub-tabs it needs a proper URL segment so the tablist can highlight it and the header "מנהל" tab has a meaningful landing target.
  - **Acceptance:** `/admin` → 307 → `/admin/users`. `/admin/users` renders the exact same table as before (same columns, same toggle behavior, same optimistic reconciliation). Phase 1 verifications V2–V7 still pass verbatim against the new URL.

- [x] **B4. `/admin/jobs` page + `components/admin/admin-jobs-table.tsx` (new).**
  - **Where:** `app/(dashboard)/admin/jobs/page.tsx` (RSC + gate), `components/admin/admin-jobs-table.tsx` (client).
  - **Issue:** No cross-user visibility into the AI-import queue. When a user reports "my import is stuck", debugging today means opening Supabase SQL editor.
  - **Acceptance:** Table lists rows from `ExcelImportJob` newest first with columns: user email (JOIN), `originalFilename`, `status` badge (color-coded by state family — pending/in-flight blue, awaiting_confirmation amber, completed green, failed red), `errorMessage` (truncated), `createdAt`, `updatedAt`, action cell. Status filter dropdown (all / pending / in-flight / awaiting_confirmation / completed / failed). Verified by uploading a valid xlsx on the QA user, observing the row transition PENDING → PARSING → AI_MAPPING → AWAITING_CONFIRMATION → CONFIRMED without refresh (polling every 5 s).

- [x] **B5. `POST /api/admin/jobs/[jobId]/reset` (new).**
  - **Where:** `app/api/admin/jobs/[jobId]/reset/route.ts`.
  - **Issue:** Jobs that die with `errorMessage='timeout_watchdog'` or with a Gemini quota error need to be re-queued for the worker. Manual UPDATE via SQL is slow and error-prone.
  - **Acceptance:** `requireAdmin()` + UUID guard. `UPDATE ExcelImportJob SET status='PENDING', errorMessage=NULL, updatedAt=now() WHERE id=<jobId>`. Returns `{ id, status: 'PENDING' }`. Verified by resetting a real failed job (from B4's table), waiting for the next worker drain (≤30 min), and observing the job progress on the same table.

- [x] **B6. `DELETE /api/admin/jobs/[jobId]` (new).**
  - **Where:** `app/api/admin/jobs/[jobId]/route.ts`.
  - **Issue:** Junk / abandoned jobs (user closed the tab, misuploaded a file) accumulate. The `ai-import-cleanup` GitHub Action clears xlsx blobs of terminal jobs older than 7 days but leaves the DB row as audit, and never touches non-terminal-but-stuck jobs.
  - **Acceptance:** `requireAdmin()` + UUID guard. Reads `storagePath`, calls `admin.storage.from('ai-imports').remove([storagePath])` (log-and-continue on failure), then `DELETE FROM ExcelImportJob WHERE id=<jobId>`. Returns `204`. Verified by uploading a xlsx, deleting via B6, and confirming both the job row is gone and the xlsx is no longer in the `ai-imports` bucket (Supabase Studio storage panel).

- [x] **B7. Job detail modal — view `aiMapping` / `extractedLegs` / `parseErrors`.**
  - **Where:** Extend `components/admin/admin-jobs-table.tsx` with an inline detail row or a side panel; new component `components/admin/admin-job-detail.tsx` if the row expands to more than ~150 lines.
  - **Issue:** The interesting fields on `ExcelImportJob` for debugging are JSON blobs. Truncated cells in the table hide them; a click-to-expand reveal lets the owner read the mapping decision Gemini made and the extracted legs preview without opening SQL.
  - **Acceptance:** Clicking a row opens a modal / expanding panel that pretty-prints `aiMapping` (with column-map or extraction-mode branch labelled), `extractedLegs` (first 20 rows), `parseErrors` (all), `importSummary` (all), `errorMessage`, and shows a "reset" and "delete" button that call B5/B6 with confirmation. All fields read-only. Verified by opening a completed job and a failed job and confirming the shape displays correctly for both discriminated union branches.

- [x] **B8. Docs — extend the CLAUDE.md admin section.**
  - **Where:** [CLAUDE.md](../../CLAUDE.md), the "Admin panel" section added in Phase 1.
  - **Issue:** Fresh reader (or fresh Claude session) needs to know Phase 2 exists, that `/admin` now redirects to `/admin/users`, and the semantic of reset vs delete.
  - **Acceptance:** New paragraph documents the AI-import jobs viewer, the reset (requeues) and delete (removes + storage cleanup) actions, and notes that reset does not re-fire the `repository_dispatch` — the `*/30` schedule handles it.

### Phase 2 verification

- [x] **V2.1.** `npm run build` + `npm run test:run` clean after B1's migration and types regen.
- [x] **V2.2.** Non-admin (`yadefam806@ameady.com`): `GET /admin/jobs` → 307 → `/research`. `POST /api/admin/jobs/<id>/reset` → 403. `DELETE /api/admin/jobs/<id>` → 403.
- [x] **V2.3.** Admin: `/admin/users` and `/admin/jobs` both reachable via the sub-tab sidebar. `/admin` → 307 → `/admin/users`.
- [x] **V2.4.** Upload a real xlsx on the QA user via `/manual-import`; the row appears in `/admin/jobs` and transitions through the status pipeline on a 5-second poll.
- [x] **V2.5.** Force a job into `errorMessage='timeout_watchdog'` (via `execute_sql`), click Reset, confirm DB row now `status='PENDING'` and re-picked up by the next worker drain.
- [x] **V2.6.** Click Delete on a completed job: DB row gone, xlsx gone from `ai-imports` bucket (verify via Supabase Storage UI).
- [x] **V2.7.** Detail modal renders correctly for a completed job (both `aiMapping.mode='mapping'` and `mode='extraction'` if both are reachable in the current data) and for a failed job (shows `errorMessage` prominently).

### Phase 2 files touched (planned)

New:
- `app/(dashboard)/admin/users/page.tsx` (moved).
- `app/(dashboard)/admin/jobs/page.tsx`.
- `app/api/admin/jobs/[jobId]/route.ts` (DELETE).
- `app/api/admin/jobs/[jobId]/reset/route.ts` (POST).
- `components/admin/admin-layout.tsx`.
- `components/admin/admin-jobs-table.tsx`.
- `components/admin/admin-job-detail.tsx` (or inline in the table — decide at implementation).
- Supabase migration (via MCP).

Modified:
- `app/(dashboard)/admin/page.tsx` — becomes a redirect.
- `app/(dashboard)/admin/layout.tsx` — mounts `AdminLayout` sub-tabs shell around `{children}`.
- `lib/db/types.ts` (regenerated).
- `CLAUDE.md`.

---

## Phase 3 — IBKR sync trigger + BrokerEvent viewer

### Context

IBKR Flex Web Service pulls run 2×/day at 13:00 & 20:00 UTC via GitHub Actions (`.github/workflows/ibkr-sync.yml`) hitting the `/api/cron/*` endpoints protected by `CRON_SECRET`. The pipeline: request statement → poll up to 4× at 10 s → download → parse (`parse-flex-xml.ts`) → `processExecutions()` → `BrokerEvent` audit row. Transient failures (IBKR slow) leave `BrokerConnection.lastSyncAt` unchanged so the next cron retries automatically.

Owner needs two capabilities the cron doesn't give:

1. **Ad-hoc single-connection sync** — during onboarding a new user, or when a user reports "missing trades from yesterday", waiting up to 6 hours for the next cron run is painful.
2. **BrokerEvent inspection + reprocessing** — every fetch stores its raw XML in `BrokerEvent.rawPayload`. When a FIFO logic bug is fixed, being able to re-run `processExecutions()` on the stored event replays historical fetches without a re-download from IBKR (Flex tokens are expensive and per-user).

### Phase 3 design decisions

- **Two new sub-tabs on the admin sidebar**: "ברוקר" (broker connections + sync trigger) and "אירועי ברוקר" (BrokerEvent list + reprocess). Keeps discoverability crisp; BrokerConnection is a lookup by-user, BrokerEvent is an event log.
- **Sync trigger runs asynchronously** via `waitUntil()` from `@vercel/functions` (same pattern as `/api/ibkr/backfill`). Endpoint returns 202 immediately; the pipeline logs to `BrokerConnection.lastSyncStatus` / `lastSyncError` as usual. Client polls the connection row for status change.
- **Reprocess re-runs `processExecutions()` only** — it does NOT re-fetch from IBKR. The input is the already-parsed executions saved in `BrokerEvent.rawPayload`. `brokerExecId` UNIQUE keeps this idempotent: legs already processed are deduped at the DB level, not by the reprocess endpoint. This is safe to click multiple times.
- **AuditEvent gets a matching admin SELECT policy** because Phase 4 will need it and the migration cost is one line; grouping it with Phase 3's RLS work is cleaner than a lone Phase 4 migration.
- **BrokerEvent viewer is filter-heavy, not detail-heavy** — most events are boring successes. Filters (userId, `eventType`, `processingStatus`, date range) make finding the interesting rows fast; the detail modal shows the raw XML/JSON for the rare deep-inspection case.

### Phase 3 items

- [x] **C1. Migration — RLS policies: admins SELECT any `BrokerConnection`, `BrokerEvent`, `AuditEvent`.**
  - **Where:** New Supabase MCP migration `add_admins_select_broker_and_audit_policies` + regenerated types.
  - **Issue:** Same as B1 — service-role reads work today; but authenticated-role admin fetch paths would return zero rows.
  - **Acceptance:** Three new policies exist in `pg_policies` (`admins_select_all_broker_connections`, `admins_select_all_broker_events`, `admins_select_all_audit_events`), each `FOR SELECT TO authenticated USING (public.is_admin((SELECT auth.uid())))`. Types regenerated. `npm run build` clean.

- [x] **C2. `/admin/ibkr` page + `components/admin/admin-ibkr-table.tsx`.**
  - **Where:** `app/(dashboard)/admin/ibkr/page.tsx` (RSC + gate), `components/admin/admin-ibkr-table.tsx` (client).
  - **Issue:** No owner-side view of who has an IBKR connection, whether it's healthy, or when the last sync ran. Currently the user's `/profile?tab=broker` shows only their own connection.
  - **Acceptance:** Table lists all `BrokerConnection` rows (typically ≤ number of users) with columns: user email (JOIN), `brokerName`, `accountId`, `isActive` badge, `lastSyncAt` (relative — "לפני 3 שעות"), `lastSyncStatus`, `lastSyncError` (truncated), action button "סנכרן עכשיו". Verified by loading the page as admin and confirming both live IBKR users appear.

- [x] **C3. `POST /api/admin/ibkr/[connectionId]/sync` (new).**
  - **Where:** `app/api/admin/ibkr/[connectionId]/sync/route.ts`.
  - **Issue:** Triggering a single-user sync outside the cron window requires either editing the workflow file or running the pipeline locally with the user's Flex token. Both are unpleasant.
  - **Acceptance:** `requireAdmin()` + UUID guard on `connectionId`. Calls the same pipeline the cron uses (extract into a reusable function if it's currently inlined in the cron route). Uses `waitUntil()` so the response is 202 within ~1 s. Verified by clicking the button on a real user's row, observing `BrokerConnection.lastSyncAt` update within the pipeline's usual runtime (~30–90 s), and seeing new Trade/Order rows if new executions were on the statement.

- [x] **C4. `/admin/broker-events` page + `components/admin/admin-broker-events-table.tsx`.**
  - **Where:** `app/(dashboard)/admin/broker-events/page.tsx` (RSC + gate), `components/admin/admin-broker-events-table.tsx` (client).
  - **Issue:** BrokerEvent is the source of truth for what IBKR sent us and how the pipeline handled it. There is no way to see the log short of SQL.
  - **Acceptance:** Paginated (50/page, page number in querystring) table across all users' events newest first with columns: user email (JOIN), `eventType`, `source`, `processingStatus` badge, `processingError` (truncated), `receivedAt`, `processedAt`, action button "פרטים". Filter chips: `processingStatus in (success, error, pending)`, `source in (ibkr_flex, manual, ...)`, free-text search on user email. Verified by loading with each filter and confirming the row count changes correctly.

- [x] **C5. BrokerEvent detail modal.**
  - **Where:** New `components/admin/admin-broker-event-detail.tsx`, mounted from the row action button in C4.
  - **Issue:** `rawPayload` is the raw XML from IBKR (or JSON for other sources); pretty-viewing it in-app avoids copy-paste to a text editor.
  - **Acceptance:** Modal shows all `BrokerEvent` fields including a monospace `<pre>` block of the `rawPayload` (pretty-printed if JSON; otherwise the raw string). All fields read-only. **No reprocess button (C6 dropped).** Verified by opening one success event and one error event.

- [ ] ~~**C6. `POST /api/admin/broker-events/[eventId]/reprocess`**~~ — ~~**Dropped 2026-07-22 by owner decision.** The reprocess feature exists to replay historical IBKR fetches against a fixed pipeline; the owner does not need user data recovery from raw payloads. `rawPayload` column stays untouched (may be re-evaluated later). No endpoint, no button in C5.~~

- [x] **C7. Docs — extend the CLAUDE.md admin section.**
  - **Where:** [CLAUDE.md](../../CLAUDE.md).
  - **Issue:** Phase 3 features need to be discoverable to a future reader.
  - **Acceptance:** New paragraph documents the IBKR sync trigger (async, `waitUntil()`, 202 pattern) and the reprocess endpoint (idempotent via `brokerExecId`).

### Phase 3 verification

- [x] **V3.1.** Build + tests clean after C1's migration.
- [x] **V3.2.** Non-admin: `/admin/ibkr`, `/admin/broker-events` both 307 → `/research`; sync + reprocess endpoints → 403.
- [x] **V3.3.** Admin: `/admin/ibkr` lists every user with an active `BrokerConnection`; each row shows the true `lastSyncAt` from the DB.
- [x] **V3.4.** Click "סנכרן עכשיו" on a real IBKR connection; response is 202 within 2 s; `BrokerConnection.lastSyncAt` and `lastSyncStatus` update within the pipeline's usual runtime.
- [x] **V3.5.** `/admin/broker-events` filters work: the "error" chip narrows to failed events; user-email search narrows correctly.
- [x] **V3.6.** Detail modal shows `rawPayload` correctly for both XML (IBKR) and JSON (any future source) rows.
- ~~V3.7 / V3.8~~ — dropped along with C6 (reprocess feature not built).

### Phase 3 files touched (planned)

New:
- `app/(dashboard)/admin/ibkr/page.tsx`.
- `app/(dashboard)/admin/broker-events/page.tsx`.
- `app/api/admin/ibkr/[connectionId]/sync/route.ts`.
- ~~`app/api/admin/broker-events/[eventId]/reprocess/route.ts`~~ (C6 dropped).
- `components/admin/admin-ibkr-table.tsx`.
- `components/admin/admin-broker-events-table.tsx`.
- `components/admin/admin-broker-event-detail.tsx`.
- Supabase migration (via MCP).
- `lib/ibkr/sync-pipeline.ts` (extracted from `/api/cron/ibkr-sync`).

Modified:
- `components/admin/admin-layout.tsx` — tabs list grows to "משתמשים", "ייבוא AI", "ברוקר", "אירועי ברוקר".
- `lib/db/types.ts` (regenerated).
- `CLAUDE.md`.
- Possibly `app/api/cron/ibkr-sync/route.ts` (refactor to expose the pipeline for reuse — must preserve exact cron behavior).

---

## Phase 4 — System health dashboard

### Context

Simple owner-side view of the app's state at a glance: how many users, how many Pro, how many trades, how big the tables are, what recent errors landed. Read-only, no actions. Purpose is monitoring, not intervention — Phase 2/3 provide the intervention paths already.

### Phase 4 design decisions

- **Server-computed metrics via a Postgres function** (`admin_system_metrics()`, `SECURITY DEFINER STABLE`) rather than a stack of Supabase JS queries. Reasons: one round-trip, atomic snapshot, and internal `if not is_admin(auth.uid()) then raise ...` gate so a naive call from a non-admin path fails loud.
- **DB table sizes come from `pg_total_relation_size`** in a second SQL function (`admin_table_sizes()`). Grouped separately because sizes are the slowest metric to compute on a large table and might warrant caching later.
- **Recent errors from `AuditEvent`** — no new table. `AuditEvent` already records billing failures, orphaned webhook events, etc. Phase 4 exposes the last 20 `status='failure'` rows with `eventType` + `metadata` + user email JOIN.
- **No charts.** A single-page dashboard with cards is enough for the current scale. Time-series can be added later if the metrics justify the graphing effort.

### Phase 4 items

- [ ] **D1. Migration — `admin_system_metrics()` + `admin_table_sizes()` SQL functions.**
  - **Where:** New Supabase MCP migration `add_admin_metrics_functions`.
  - **Issue:** Metrics scattered across N tables shouldn't be N round-trips from the app. A single RPC returning a JSON snapshot is trivial and testable in SQL.
  - **Acceptance:**
    - `admin_system_metrics()` returns a JSON object with keys: `usersTotal`, `usersPro`, `usersFree`, `usersSignups7d`, `tradesTotal`, `tradesOpen`, `tradesClosed`, `trades7d`, `ordersTotal`, `orders7d`, `brokerConnectionsActive`, `jobsPending`, `jobsFailed`, `auditFailures24h`.
    - `admin_table_sizes()` returns rows `{table, sizeBytes}` for `User`, `Trade`, `Order`, `BrokerEvent`, `ExcelImportJob`, `AuditEvent`, `BillingWebhookEvent`.
    - Both are `SECURITY DEFINER STABLE`, both first-line-check `if not public.is_admin(auth.uid()) then raise 'admin_only'`, and grants `EXECUTE` only to `authenticated` + `service_role`.
    - Types regenerated, `npm run build` clean.

- [ ] **D2. `/admin/health` page + `components/admin/admin-health-dashboard.tsx`.**
  - **Where:** `app/(dashboard)/admin/health/page.tsx` (RSC + gate) reads the metrics via `createAdminClient().rpc('admin_system_metrics')`. Client component renders cards.
  - **Issue:** No unified place to see "is the app healthy right now".
  - **Acceptance:** Grid of cards for each metric key from D1's JSON. Cards are grouped visually: Users (Total / Pro / Free / New this week), Activity (Trades total / Open / Closed / New this week; Orders total / new this week), Integrations (Active broker connections; Jobs pending; Jobs failed), Health (Audit failures in last 24h). Numbers are IBM Plex Mono. Verified by cross-checking each card against a direct `SELECT COUNT(*)` on the underlying table.

- [ ] **D3. Recent AuditEvent failures section.**
  - **Where:** Extend `admin-health-dashboard.tsx` with a table below the cards, or a companion component `components/admin/admin-recent-failures.tsx`.
  - **Issue:** Knowing "audit failures = 5" is useless without seeing which. This surfaces the `eventType` + `metadata` + user email of the last 20 failures.
  - **Acceptance:** Table shows last 20 `AuditEvent` rows where `status='failure'`, newest first, with columns: `createdAt`, user email (JOIN, may be null if userId is null), `eventType`, `metadata` (JSON snippet, truncated), `ipAddress`. Verified by injecting a synthetic failure via `logAuditEvent(...)` and seeing it appear on the page after refresh.

- [ ] **D4. DB table sizes section.**
  - **Where:** Extend `admin-health-dashboard.tsx` with a small table.
  - **Issue:** Table growth is the leading indicator for when to add pruning / archiving. Owner wants to see it at a glance.
  - **Acceptance:** Table lists rows from `admin_table_sizes()` sorted by `sizeBytes` desc, with human-formatted size ("12.4 MB"). Verified by comparing one row against `SELECT pg_size_pretty(pg_total_relation_size('"Trade"'))` in SQL.

- [ ] **D5. Docs — extend the CLAUDE.md admin section.**
  - **Where:** [CLAUDE.md](../../CLAUDE.md).
  - **Issue:** The `admin_system_metrics()` / `admin_table_sizes()` functions are new invariants; a fresh reader should be able to find them.
  - **Acceptance:** New paragraph documents the health dashboard, the two RPCs, and the fact they self-gate on `public.is_admin(auth.uid())`.

### Phase 4 verification

- [ ] **V4.1.** Build + tests clean after D1's migration.
- [ ] **V4.2.** Non-admin: `/admin/health` → 307 → `/research`. Direct RPC call `supabase.rpc('admin_system_metrics')` as an authenticated non-admin → error `admin_only`.
- [ ] **V4.3.** Admin: `/admin/health` renders all cards with the correct counts. Cross-verify at least 3 cards against direct `SELECT COUNT(*)`.
- [ ] **V4.4.** Trigger a synthetic audit failure (e.g. `INSERT INTO "AuditEvent" (status, eventType) VALUES ('failure', 'test_admin_dashboard')`); it appears in the recent-failures table after refresh.
- [ ] **V4.5.** Table sizes row for `Trade` matches `pg_size_pretty(pg_total_relation_size('"Trade"'))` within one binary unit.

### Phase 4 files touched (planned)

New:
- `app/(dashboard)/admin/health/page.tsx`.
- `components/admin/admin-health-dashboard.tsx`.
- `components/admin/admin-recent-failures.tsx` (optional; may inline into the dashboard).
- Supabase migration (via MCP).

Modified:
- `components/admin/admin-layout.tsx` — tabs list grows by one ("בריאות").
- `lib/db/types.ts` (regenerated).
- `CLAUDE.md`.

---

## Open questions / items requiring owner input

- ~~Phase 3 sync-pipeline extraction.~~ **Resolved 2026-07-22**: option 1a — `syncOneConnection` moves to `lib/ibkr/sync-pipeline.ts`, cron becomes a thin caller.
- **Phase 4 metric definitions** — **Resolved 2026-07-22**: basic + Retention (30/60/90d, active = trade in last 14d) + IBKR sync success rate (7d) + Chat usage (24h/7d from `AIConversation`) + **time-series charts** for signups and trades over 30d. Skipping: median trades per user, MRR, Sentry error count.
- ~~Reprocess semantics (C6).~~ **Resolved 2026-07-22**: C6 dropped entirely. No reprocess endpoint. rawPayload column preserved but no in-app consumer for it beyond C5's viewer.
- **Impersonation (deferred entirely).** **Resolved 2026-07-22**: option 4a — never built. Not in this plan. If a real support scenario surfaces where the owner needs to see the app *as* a specific user, revisit. Would require Supabase Auth admin API `generate_link` + a session-swap flow with explicit "you are viewing as X" banner and auto-revert on close.

## Discovered during remediation

> Add new findings here as they surface while executing Phases 2–4. Use `[ ] {PREFIX}{N}. {title}` shape with Where / Issue / Acceptance. Prefixes continue: `B` (Phase 2), `C` (Phase 3), `D` (Phase 4). If a discovery doesn't map to any active phase, use `E{N}` and note the intended phase.
