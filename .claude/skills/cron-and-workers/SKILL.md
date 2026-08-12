---
name: cron-and-workers
description: Cron jobs, GitHub Actions workflows, the AI-import worker queue, IBKR sync scheduling, backfill, and pg_cron retention. Load when touching .github/workflows, /api/cron routes, or anything scheduled or long-running.
---

# Backfill, cron & background workers

All scheduling is external — **GitHub Actions curling Vercel endpoints**, plus `pg_cron`
inside Postgres. There are no Vercel Cron entries.

## Backfill

`POST /api/ibkr/backfill` returns 202; `GET` polls status. Uses `waitUntil()` from
`@vercel/functions` — this replaced `setImmediate`, which Vercel killed as soon as the
response was sent.

## IBKR sync

GitHub Actions fires at **13:00 & 20:00 UTC** ([.github/workflows/ibkr-sync.yml](../../../.github/workflows/ibkr-sync.yml)).
Twice a day because only the **Activity** Flex Query is used and it updates once per
end-of-day (Trade Confirmations was dropped; `flexQueryIdTrades` is nullable and unused).

Step 2 polls every 10s up to **4 attempts** (~40s). IBKR typically generates the statement
within 1–2 attempts. If all 4 fail, `IbkrTransientError` is thrown → `lastSyncAt` is **not**
updated → the next cron run retries automatically. Don't add retry logic on top of this; the
non-update *is* the retry mechanism.

The pipeline itself lives in [lib/ibkr/sync-pipeline.ts](../../../lib/ibkr/sync-pipeline.ts):
`syncOneConnection(admin, conn)` and `syncActiveConnections(admin)`. The cron route is a thin
caller and the `/admin/ibkr` manual trigger reuses the same code — keep it that way so the two
paths can't drift.

## Massive price cron

Currently **disabled** — the workflow was never added. Code paths still exist for re-enabling.

## AI-import worker

[.github/workflows/ai-import-worker.yml](../../../.github/workflows/ai-import-worker.yml)
drains up to 5 queued `ExcelImportJob`s per run via `scripts/process-ai-import-queue.ts` (run
with `tsx`).

- **Primary trigger** is on-demand `repository_dispatch` from the upload route (needs
  `AI_IMPORT_DISPATCH_TOKEN` / `AI_IMPORT_DISPATCH_REPO` in Vercel — processes within seconds).
- The `*/30 * * * *` schedule is **only** a safety net for a silently-failed dispatch. It's
  deliberately infrequent to save Actions minutes, since dispatch handles the common case.
- A `concurrency` guard prevents overlapping drains. Claims are atomic via the
  `claim_excel_import_job()` RPC (`FOR UPDATE SKIP LOCKED`).
- **Watchdog** (`*/15`): fails jobs stuck in an in-flight state >15 min, setting
  `errorMessage='timeout_watchdog'`.
- **Cleanup** (daily `0 3`): removes uploaded xlsx files for terminal jobs older than 7 days.
  The job row is kept as audit.

The worker holds **only** `SITE_URL` + `CRON_SECRET` + `GEMINI_API_KEY` — least privilege, no
Supabase URL and no service-role key on the runner. It reaches the DB exclusively through the
narrow proxy endpoints `/api/cron/ai-import-{claim,status,result}`. Keep it that way.

## Two gotchas that have already cost real downtime

**Never call a cron endpoint with a bare `curl -f`.** Use the composite action
[.github/actions/call-cron](../../../.github/actions/call-cron/action.yml). It asserts HTTP 200
**and** a jq predicate on the body (default `.ok == true`), so a 200-but-did-nothing response
fails the run. Workflows using it need `actions/checkout` first — local composite actions are
resolved from the checked-out tree.

**`SITE_URL` must be the non-redirecting origin** (`https://tradeanalyst.app`, no `www`).
This is not cosmetic: `curl -f` does not fail on 3xx, and `-L` would strip the `Authorization`
header across origins. A redirecting value makes every cron silently no-op while Actions stays
green. That exact bug ran from **2026-05-26 to 2026-07-28**. The `call-cron` HTTP assertion
and the `staleSyncConnections` metric on `/admin/health` are the two guards against a repeat —
don't remove either.

## pg_cron retention

`purge-broker-events` (migration `schedule_broker_event_retention_90d`): daily `0 4 * * *` UTC,
`DELETE FROM "BrokerEvent" WHERE "receivedAt" < now() - interval '90 days'`. The 04:00 window is
deliberately outside the IBKR sync slots. 90 days trades debuggability (the `/admin/broker-events`
surface stays useful for recent-week investigations) against unbounded growth
(~10 KB/row × 2 syncs/day/user). Change the retention by re-running the migration with a new
interval.

## Geo gate interaction

`/api/cron/*` is excluded by the **proxy matcher** in [proxy.ts](../../../proxy.ts), which is
what keeps the US-based GitHub Actions crons working. Do not remove that exclusion — see
[docs/decisions/geo-gate.md](../../../docs/decisions/geo-gate.md).
