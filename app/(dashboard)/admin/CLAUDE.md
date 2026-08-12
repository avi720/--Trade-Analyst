# Admin panel

Private in-app admin surface at `/admin`, gated by the `User.isAdmin` boolean column. Not
linked from any public UI — a "מנהל" tab appears in the header only when `isAdmin=true`, and
both [layout.tsx](layout.tsx) and **each sub-page** re-check the flag and redirect to
`/research` otherwise. Keep that double check when adding a page.

Purpose: manual QA of Pro-gated flows, hands-on recovery of stuck AI-import jobs, on-demand
IBKR syncs / audit inspection, and read-only system-health monitoring. **No impersonation, no
session-swap** — deliberately out of scope.

`/admin` itself redirects to `/admin/users`. The sub-tabs sidebar
(`components/admin/admin-layout.tsx`) is a client-side RTL vertical tablist mirroring the
profile page pattern — URL-driven active state, `ArrowUp/Down/Home/End` keyboard nav.

To become an admin: `UPDATE "User" SET "isAdmin"=true WHERE email='…';` via Supabase MCP
`execute_sql`. No self-service; the owner sets the flag directly in Postgres.

Rollout plan: [docs/in-progress/ADMIN-PANEL.md](../../../docs/in-progress/ADMIN-PANEL.md).
Phases 1–4 shipped.

## RLS

Admins `SELECT` any row via additive `admins_select_all_*` policies on `User`,
`ExcelImportJob`, `BrokerConnection`, `BrokerEvent` and `AuditEvent`. All are keyed off the
`SECURITY DEFINER public.is_admin(uuid)` helper — needed to break the infinite recursion the
naive `EXISTS(SELECT ... FROM "User")` form causes. Reuse the helper; don't inline the EXISTS.

## Phase 1 — Users list + Pro/Free toggle

`/admin/users`, `POST /api/admin/users/[userId]/toggle-tier`

- Runs `requireAdmin()` from `lib/auth/require-admin.ts` (401/403 on failure).
- Writes via `createAdminClient()` because billing columns are RLS-protected against
  `authenticated`-role writes (migration `harden_user_billing_write_paths`).
- Sets `subscriptionTier` + a **fake** matching `subscriptionStatus` (`active` on upgrade,
  `cancelled` on downgrade) and `subscriptionRenewsAt` (`now + 30d` / `null`), so the
  profile ▸ מנוי tab reads a coherent state.
- **Never touches `lemonsqueezyCustomerId` / `lemonsqueezySubscriptionId`** — a real Lemon
  Squeezy webhook must still be able to overwrite the fake state cleanly.

## Phase 2 — AI-import jobs viewer

`/admin/jobs`, endpoints under `/api/admin/jobs/*`

- Lists the 200 most-recent `ExcelImportJob` rows across all users, filterable by status
  (`PENDING`/`PARSING`/`AI_MAPPING`/`IMPORTING`/`AWAITING_CONFIRMATION`/`COMPLETED`/`FAILED`/`CANCELLED`).
- **Reset** (`POST .../[jobId]/reset`) puts a job back to `PENDING` and clears `errorMessage`;
  the next worker drain re-claims it via `claim_excel_import_job()`. Reset does **not** re-fire
  `repository_dispatch` — the app has no GitHub PAT for that.
- **Delete** (`DELETE .../[jobId]`) removes the xlsx from the `ai-imports` bucket
  (best-effort, log-and-continue) then hard-deletes the row. Returns 204.
- Detail modal shows the full row — pretty-printed `aiMapping` (both `mode:'mapping'` and
  `mode:'extraction'` branches), first-20 `extractedLegs`, `parseErrors`, `importSummary`,
  `errorMessage`.
- The table polls `GET /api/admin/jobs` every 5s **only** while a visible row is non-terminal;
  polling stops when everything settles. Preserve that condition — unconditional polling on an
  admin table is a quiet cost.

## Phase 3 — IBKR sync trigger + BrokerEvent viewer

`/admin/ibkr`, `/admin/broker-events`, endpoints under `/api/admin/ibkr/*` and
`/api/admin/broker-events/*`

- `/admin/ibkr` lists every `BrokerConnection` with `lastSyncAt` / `lastSyncStatus` /
  `lastSyncError` and a **סנכרן עכשיו** button per active row.
- **Manual sync** (`POST /api/admin/ibkr/[connectionId]/sync`) fires `syncOneConnection`
  through `waitUntil()` from `@vercel/functions` (same async pattern as `/api/ibkr/backfill`).
  Returns 202 immediately; the UI polls `GET /api/admin/ibkr` every 5s while a sync is in
  flight. The shared pipeline is `lib/ibkr/sync-pipeline.ts` — see the `cron-and-workers` skill.
- `/admin/broker-events` lists every `BrokerEvent` across users, 50/page, filterable by
  `processingStatus`. Detail modal shows the full row + a `<pre>` of `rawPayload` (`xml` for
  `IBKR_FLEX` events, JSON otherwise). **Read-only** — there is no reprocess endpoint, dropped
  by owner decision 2026-07-22; the plan doc explains why.

## Phase 4 — System health dashboard

`/admin/health`, read-only, no polling — refresh reruns the fetches.

[health/page.tsx](health/page.tsx) is a plain RSC: reads three RPCs + the last 20 `AuditEvent`
failures (JOIN to `User.email`) in a single `Promise.all` under `createAdminClient()`, then
hands the frozen snapshot to `components/admin/admin-health-dashboard.tsx`.

The three `SECURITY DEFINER STABLE` functions (migration `add_admin_metrics_functions`) are
described in the `db-schema` skill. What they return:

- `admin_system_metrics()` → one JSON snapshot: users (total / Pro / Free / signups 7d);
  retention 30/60/90d (`active` = user has an `Order` with `executedAt ≥ now-14d`, denominator
  = users with `createdAt ≤ now-Nd`); activity (trades total/open/closed/7d, orders total/7d);
  integrations (active broker connections, pending / failed jobs); broker-sync staleness
  (`staleSyncConnections` = active connections with `lastSyncAt` NULL or older than 48h,
  `brokerSyncErrors`, `lastBrokerSyncAt` — migration `add_broker_sync_staleness_metrics`);
  IBKR success rate 7d (`BrokerEvent` where `source='IBKR_FLEX'`, success =
  `processingStatus='PROCESSED'`); chat usage 24h/7d (conversations + distinct users on
  `AIConversation.updatedAt`); `auditFailures24h`.
- `admin_table_sizes()` → 7 rows `{tableName, sizeBytes}` from `pg_total_relation_size()`.
- `admin_timeseries(days)` → `{day, signups, trades}` per day, guarded to `[1,365]`, using
  `generate_series` so zero-activity days show as 0.

`staleSyncConnections` is not a nice-to-have — it is one of the two guards against the
`SITE_URL` redirect bug recurring. See the `cron-and-workers` skill.

The client dashboard renders card groups (Users / Retention / Activity / Integrations / IBKR /
Chat / Health), two `recharts` LineCharts (daily signups + daily trades over 30d, reusing the
axis/tooltip constants from `components/research/shell.tsx`), the table-sizes table and the
recent-failures table. All numbers use IBM Plex Mono.
