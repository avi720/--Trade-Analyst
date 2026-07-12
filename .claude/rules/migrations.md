# Migrations & generated types

## Schema changes

Apply schema changes via the **Supabase MCP `apply_migration` tool** — not by editing SQL files by hand, not via a local Supabase CLI, not via Prisma.

Each migration should be idempotent-safe where practical (use `IF NOT EXISTS` / `IF EXISTS` for objects that may already have been created out-of-band).

## Regenerating the typed Database client

After any schema change, regenerate `Database` types:

1. Call the Supabase MCP `generate_typescript_types` tool for project id `nwvswntqrqqtwzrhzpmi`.
2. Write the output to [lib/db/types.ts](../../lib/db/types.ts), replacing the file.

Do **not** hand-edit `lib/db/types.ts` — it is fully generated and any manual change will be overwritten on the next regeneration.

## RLS on new tables

Ship RLS enabled + a `auth.uid() = "userId"` policy in the same migration that creates the table. See [multi-user.md](multi-user.md).
