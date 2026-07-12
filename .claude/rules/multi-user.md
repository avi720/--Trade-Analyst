# Multi-user SaaS — data-layer rules

The app ships as a public multi-user SaaS (public signup via `/signup`). Do **not** add single-user shortcuts, even for local convenience.

## Architecture invariants

- Every app table has a `userId` FK (or is the `User` table itself).
- Every app table has RLS policies of the form `auth.uid() = "userId"` (or `= "id"` on `User`).
- New tables must ship with RLS enabled + a policy in the same migration.

## Data access

- **Supabase JS client only.** No ORM.
  - Server: `@supabase/ssr` via [lib/supabase/server.ts](../../lib/supabase/server.ts).
  - Browser / scripts: `@supabase/supabase-js`.
- Type safety comes from the generated `Database` type in [lib/db/types.ts](../../lib/db/types.ts).
- The `_prisma_migrations` table is a leftover from initial bootstrap — kept as an audit row, not used by tooling. Don't reintroduce Prisma or any ORM.

## Never bypass RLS from request paths

- Only [lib/supabase/admin.ts](../../lib/supabase/admin.ts) (service-role) skips RLS.
- Reserved for **cron jobs** (`app/api/cron/*`), the **seed script**, and equivalent server-only workflows.
- Never import `createAdminClient` into a route handler that runs on behalf of an authenticated user request — use the regular server client so RLS enforces user scoping.
