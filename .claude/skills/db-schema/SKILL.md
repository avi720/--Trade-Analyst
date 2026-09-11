---
name: db-schema
description: Migrations, schema changes, adding tables or columns, RLS policies, database RPCs, and regenerating lib/db/types.ts. Also the Trade/Order/User column inventory and which columns were deliberately dropped and must not come back. Load before any schema change.
---

# DB schema, migrations & generated types

Supabase Postgres, project id `nwvswntqrqqtwzrhzpmi`. Accessed through the Supabase JS
client (`@supabase/ssr` server, `@supabase/supabase-js` browser/scripts), typed via the
generated `Database` type in [lib/db/types.ts](../../../lib/db/types.ts).

## Applying a schema change

Apply schema changes via the **Supabase MCP `apply_migration` tool** — not by editing SQL
files by hand, not via a local Supabase CLI, not via Prisma.

Each migration should be idempotent-safe where practical (use `IF NOT EXISTS` / `IF EXISTS`
for objects that may already have been created out-of-band).

Never change the schema by hand in the dashboard or via `execute_sql`. Replaying the migration
history onto an empty project (how the `Trade-Analysis-dev` preview DB was built) must reproduce
production exactly; three hand-made changes broke that and had to be codified after the fact in
`codify_out_of_band_prod_drift`. Apply every migration to both projects — production
`nwvswntqrqqtwzrhzpmi` and dev `sssichkbdqariguvqprc` — so their histories stay identical.

## Regenerating the typed Database client

After **any** schema change, regenerate the `Database` types:

1. Call the Supabase MCP `generate_typescript_types` tool for project id `nwvswntqrqqtwzrhzpmi`.
2. Write the output to [lib/db/types.ts](../../../lib/db/types.ts), replacing the file.

Do **not** hand-edit `lib/db/types.ts` — it is fully generated and any manual change will be
overwritten on the next regeneration. `npm run build` is the backstop here: the TypeScript
gate fails on columns the generated types don't know about.

## RLS on new tables

Ship RLS enabled + an `auth.uid() = "userId"` policy in the **same migration** that creates
the table. See [`.claude/rules/multi-user.md`](../../rules/multi-user.md).

Admin-wide read access uses additive `admins_select_all_*` policies keyed off the
`SECURITY DEFINER public.is_admin(uuid)` helper. The helper exists because the naive
`EXISTS(SELECT ... FROM "User")` form causes infinite policy recursion.

## Table highlights

- `Trade` + `Order` — FIFO-based. Each execution = one `Order`. A `Trade` aggregates multiple `Order`s.
- `Order.brokerExecId` — UNIQUE. Global idempotency key for IBKR dedup.
- `Order.brokerOrderId` — NOT unique. Groups partial fills.
- `BrokerEvent` — raw XML audit log of every IBKR fetch. 90-day retention via the `pg_cron`
  job `purge-broker-events`.
- `BrokerConnection.flexTokenEncrypted` — AES-256-GCM. Never returned in API responses.
- `User.settings` (Json) — display preferences (currency, dateFormat, numberFormat, timezone)
  live under `settings.display`. There are **no** dedicated columns for these. API:
  `GET/PATCH /api/profile`.
- `User.isAdmin` (boolean) — gates the `/admin` surface.
- There is no `_prisma_migrations` table. `phase2_initial_schema` creates it (Prisma bootstrap
  leftover); `codify_out_of_band_prod_drift` drops it.

### Columns deliberately removed — do not re-add

`Order` columns dropped in the P8 cleanup of `docs/in-progress/PERFORMANCE-AUDIT.md`:
`tax`, `tradeDate`, `exchange`, `proceeds`, `brokerTradeId`, `rawPayload`. The audit trail
lives on `BrokerEvent.rawPayload` instead. If you find yourself wanting one of these back,
the data is already available elsewhere — check before migrating.

`Order.broker` was **reinstated** as an explicit column in P11. It had previously been stashed
inside the now-dropped `rawPayload` blob where no query could read it. Keep it a real column.

`Order` columns actually in use: `id`, `tradeId`, `userId`, `side`, `quantity`, `price`,
`commission`, `executedAt`, `brokerExecId`, `brokerOrderId`, `brokerClientAccountId`,
`currency`, `orderType`, `netCash`, `commissionCurrency`, `orderTime`, `broker`.

`User` columns: `id`, `email`, `name` (display name = firstName + lastName), `firstName`,
`lastName`, `phone`, `addressStreet`, `addressCity`, `addressCountry`, `isAdmin`,
`settings` (Json), `createdAt`, plus the billing columns (`subscriptionTier`,
`subscriptionStatus`, `subscriptionRenewsAt`, `lemonsqueezyCustomerId`,
`lemonsqueezySubscriptionId`).

Billing columns are RLS-protected against `authenticated`-role writes (migration
`harden_user_billing_write_paths`) — write them only through `createAdminClient()`.

## Database RPCs

- `reverse_position(...)` — atomic FIFO REVERSAL (close existing position + open opposite-side
  trade in one Postgres transaction). 11 params; see
  [`.claude/rules/reverse-position-rpc.md`](../../rules/reverse-position-rpc.md) for the
  signature and guard semantics.
- `claim_excel_import_job()` — atomic job claim for the AI-import worker
  (`FOR UPDATE SKIP LOCKED`).
- `is_admin(uuid)` — `SECURITY DEFINER` helper backing every `admins_select_all_*` policy.
- `admin_system_metrics()`, `admin_table_sizes()`, `admin_timeseries(days)` — read-only
  metrics for `/admin/health`. All `SECURITY DEFINER STABLE`, self-gating on
  `is_admin(auth.uid())` (raise `admin_only` otherwise), granted to **`service_role` only**
  (migration `revoke_admin_metrics_rpc_from_anon_authenticated`). `/admin/health` reaches them
  through `createAdminClient()`, so no other role needs `EXECUTE`. Note that Supabase's default
  privileges on `public` grant `EXECUTE` on every new function to `anon` **and**
  `authenticated` — a new admin-only RPC must revoke them explicitly, or advisors 0028/0029
  fire.
  `is_admin(uuid)` is the exception: `authenticated` must keep `EXECUTE`, because RLS policy
  expressions are evaluated with the querying role's privileges and every
  `admins_select_all_*` policy calls it.
