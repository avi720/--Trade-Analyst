# Trade Analysis — Handoff to Session 3

**Status**: Phase 0 + Phase 1 + Phase 2 complete. Ready for Phase 3 (IBKR Flex integration).
**Branch**: `main` (work directly on main, no feature branches for this single-user proprietary tool)
**Last commit**: `bc60831` — *Phase 2: DB models + FIFO logic, no ORM (Supabase SDK direct)*
**Remote**: `https://github.com/avi720/--Trade-Analyst2.git` — pushed, up to date

---

## Project

**Trade Analysis** — Hebrew RTL trading journal with AI (Next.js 14 + Supabase + IBKR Flex + Polygon + Gemini).

- **Currently single-user** (no signup UI; account created manually in Supabase dashboard).
- **Future plan: SaaS** — DB is already multi-user ready (`userId` FK + RLS on every app table). Don't add single-user shortcuts.
- Hosted on **Render** (planned: 1 Web Service + Cron Jobs).

---

## Environment & Machine Quirks

- **OS**: Windows 11 Pro on **ARM64** (Snapdragon / Surface-class). Node.js at `D:\Program Files\Node` is the **native ARM64** build.
- **Project path**: `D:\avipa\Documents\Programming\‏‏Trade Analyst` (RTL marks in "Trade").
- **Shell**: Git Bash / MINGW64. Use Unix-style paths.
- **Windows build fix**: always use `NEXT_TELEMETRY_DISABLED=1 npm run build` to avoid `EXDEV: cross-device link not permitted`.
- **ARM64 native binary trap**: x64-only `.node` files won't load in ARM64 Node (symptom: `is not a valid Win32 application`). This is what killed Prisma — see below.

---

## Major Architectural Pivot in This Session: **No more Prisma**

Prisma 6.6 has no `windows-arm64` binary target (verified — `binaryTargets = ["native", "windows-arm64"]` produces "Unknown binary target"). Instead of shimming with try/catch or installing x64 Node under emulation, we **eliminated Prisma entirely** and use the **Supabase JS SDK directly** as our DB layer.

| Old | New |
|-----|-----|
| `prisma/schema.prisma` | Migrations applied via Supabase MCP `apply_migration` |
| `@prisma/client` generated types | `lib/db/types.ts` generated via Supabase MCP `generate_typescript_types` |
| `prisma.user.upsert(...)` | `supabase.from('User').upsert(...)` |
| `prisma.$transaction([close, open])` for REVERSAL | `supabase.rpc('reverse_position', {...})` Postgres function |
| `prisma/seed.ts` | `scripts/seed.ts` with `createAdminClient()` |

**Removed packages**: `@prisma/client`, `@prisma/adapter-pg`, `@types/pg`, `pg`, `prisma`.
**Added**: `dotenv` (devDep, for vitest integration tests).
**Bumped**: `@supabase/ssr` → `^0.6.1`, `@supabase/supabase-js` → `^2.104.1`.

**Three Supabase clients** (`lib/supabase/`):
- `server.ts` — Server Components / Route Handlers, anon key, **RLS enforced**.
- `client.ts` — Client Components, anon key, RLS enforced.
- `admin.ts` — Service-role key, **bypasses RLS**. For seeds, cron, integration tests, admin operations.

**`@supabase/ssr` v0.6.x typing gotcha**: `createServerClient<Database>` does not propagate the `Database` generic to `from()` / `upsert()` callsites — TypeScript narrows the values param to `never`. Runtime is fine. Workaround in `lib/supabase/server.ts`:

```typescript
return createServerClient<Database>(...) as unknown as SupabaseClient<Database>
```

Remove the cast once upstream is fixed.

---

## External Services

| Service | Status | Notes |
|---------|--------|-------|
| Supabase | ✅ Connected via MCP | Project ID: `nwvswntqrqqtwzrhzpmi` |
| Polygon | Keys in `.env.local` | Free tier — 15 min delayed, 5 calls/min. Phase 4. |
| Gemini | Keys in `.env.local` | `gemini-2.0-flash`. Phase 7. |
| IBKR Flex | Not yet integrated | Phase 3 |
| GitHub | Pushed | `https://github.com/avi720/--Trade-Analyst2` |
| Render | Not yet deployed | Optional before Phase 3 |

---

## `.env.local` (on disk, not in git)

```env
NEXT_PUBLIC_SUPABASE_URL=https://nwvswntqrqqtwzrhzpmi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_q7Um2e9p7tYPpv6oTxJ8Pw_wD2DzSHK
SUPABASE_SERVICE_ROLE_KEY=<filled>
FLEX_TOKEN_ENCRYPTION_KEY=<32-byte hex>
MASSIVE_API_KEY=<filled>
GEMINI_API_KEY=<filled>
```

**Removed** (no Prisma): `DATABASE_URL`, `DIRECT_URL`.

---

## Directory Structure (current)

```
app/
  (auth)/login/page.tsx
  (dashboard)/
    layout.tsx                     ← server auth gate + User upsert (no Prisma)
    dashboard/page.tsx             ← placeholder (Phase 5)
    research/page.tsx              ← placeholder (Phase 6)
    search/page.tsx                ← placeholder (Phase 8)
    profile/page.tsx
    settings/page.tsx              ← placeholder (Phase 3 will fill)
  auth/callback/route.ts

components/
  header.tsx
  sync-indicator.tsx               ← placeholder (wired Phase 3+4)

lib/
  supabase/
    server.ts                      ← cast workaround for ssr 0.6.x
    client.ts
    admin.ts                       ← service-role client
  db/
    types.ts                       ← generated Database type (regenerate via MCP)
  trade/
    fifo.ts                        ← pure matchExecution()
  ibkr/
    parse-date.ts                  ← dd/MM/yyyy;HH:mm:ss TZ → UTC
  utils/
    cn.ts
    calculations.ts                ← calcStats, equityCurve, rDistribution, setupPerformance

scripts/
  seed.ts                          ← 27 synthetic trades, uses createAdminClient

types/
  trade.ts                         ← NormalizedExecution, FifoAction, ClosedTrade

__tests__/
  parse-date.test.ts               ← 20 tests
  calculations.test.ts             ← 17 tests
  fifo.test.ts                     ← 22 tests
  integration/
    fifo-to-db.test.ts             ← 2 tests against real Supabase

middleware.ts
next.config.mjs                    ← bare {} now (no serverComponentsExternalPackages)
CLAUDE.md                          ← read first in new session
docs/
  phase-1-handoff.md
  phase-2-handoff.md               ← this file
```

**Deleted in this session**: `prisma/`, `lib/prisma.ts`.

---

## Phase 2 — DB Models + FIFO Logic (DONE, commit `bc60831`)

### DB Migrations (via Supabase MCP `apply_migration`)

1. **`phase2_initial_schema`** — 7 tables (User, Trade, Order, BrokerConnection, BrokerEvent, AIConversation, _prisma_migrations sentinel) with `UUID` ids, RLS enabled on all 6 app tables. Policy form: `auth.uid() = "userId"` (or `= "id"` on User). `Order` has denormalized `userId` for O(1) RLS without subquery.
2. **`phase3_reverse_position_fn`** — atomic Postgres function for FIFO REVERSAL (close + open in one transaction). Note: an older 5-param overload from an earlier attempt still exists — **always use the 11-param `p_`-prefixed version**:
   ```typescript
   await supabase.rpc('reverse_position', {
     p_close_trade_id, p_close_status, p_close_at,
     p_avg_exit_price, p_actual_r, p_result,
     p_realized_pnl, p_total_commission,
     p_close_order, p_new_trade, p_new_order,
   })
   ```

### FIFO logic (`lib/trade/fifo.ts`)

`matchExecution(exec, openTrade) → FifoAction` discriminated union: `OPEN | SCALE_IN | REDUCE | CLOSE | REVERSAL`.

- All arithmetic uses plain `number` (Postgres NUMERIC → JS number via Supabase SDK).
- `actualR` is null when `stopPrice` is null OR `riskPerShare < 0.0001` (prevents Infinity/NaN).
- `rDistribution` uses left-inclusive bins `[min, max)`. r=0 → "0R–1R", r=2 → ">2R".
- **REVERSAL must be persisted via `supabase.rpc('reverse_position', ...)`** — documented in JSDoc.

### Tests

61 unit tests + 2 integration tests. **All 61/61 pass. Build clean.**

`vitest.setup.ts` loads `.env.local` via `dotenv` so integration tests find Supabase keys.

---

## Key Technical Decisions (cumulative)

| Decision | Choice | Reason |
|----------|--------|--------|
| Auth | Supabase email+password, login-only | Single-user now; SaaS later |
| ORM | **None** — Supabase JS SDK directly | Prisma has no ARM64 binary; SDK is type-safe via generated `Database` |
| Migrations | Supabase MCP `apply_migration` | No local Postgres CLI needed |
| Type generation | Supabase MCP `generate_typescript_types` → `lib/db/types.ts` | Single source of truth |
| Multi-user | RLS on every app table from day 1 | SaaS-ready architecture |
| REVERSAL atomicity | Postgres function `reverse_position` via `rpc()` | One transaction, no client-side $transaction |
| Date parsing | Manual `Date.UTC()` (NOT date-fns parse) | date-fns parse uses local TZ |
| Hosting | Render Web Service (+ future Cron) | Persistent Node process |

---

## Bugs Fixed in This Session

1. **Prisma ARM64 incompatibility** → eliminated Prisma entirely, switched to Supabase SDK.
2. **`@supabase/ssr` 0.6.x type narrowing to `never`** → `as unknown as SupabaseClient<Database>` cast in `server.ts`.
3. **Integration test `rawPayload: object` not assignable to `Json`** → import `Json` from `@/lib/db/types`, cast as `Json`.
4. **vitest can't see `.env.local`** → added `dotenv` to `vitest.setup.ts`.

---

## Pending Before Phase 3

- [ ] Optional: deploy to Render to validate the persistent-Node deployment shape before adding cron jobs.
- [ ] Confirm seed runs cleanly against the live DB (`npm run db:seed`).

---

## Full Roadmap

| Phase | Content | Status |
|-------|---------|--------|
| 0 | Planning | ✅ Done |
| 1 | Foundation — Next.js + Auth + Layout | ✅ Done |
| 2 | DB Models + FIFO Logic + Tests | ✅ Done (no ORM, Supabase SDK) |
| 3 | IBKR Flex Integration + Cron | 🔲 Next |
| 4 | Polygon Price Updates | 🔲 |
| 5 | Real-Time Dashboard | 🔲 |
| 6 | Research Dashboard | 🔲 |
| 7 | AI Chat (Hanan, server-side) | 🔲 |
| 8 | Search + Polish | 🔲 |

**Rule: do not start a new phase without explicit approval.**
