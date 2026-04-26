# CLAUDE.md — Trade Analysis

## Commands

```bash
npm run dev       # Dev server (http://localhost:3000)
npm run build     # Production build
npm run start     # Start production server
npm run test      # Run tests (Vitest, watch)
npm run test:run  # Run tests once (CI mode)
npm run db:seed   # Seed DB (uses .env.local + service-role key)

# DB schema changes go through the Supabase MCP `apply_migration` tool.
# To regenerate the typed Database client:
#   call MCP `generate_typescript_types` for project nwvswntqrqqtwzrhzpmi
#   → write the output to lib/db/types.ts
```

## Architecture

**Trade Analysis** is a Hebrew RTL trading journal with AI (Next.js 14 App Router + Supabase).
Single-user proprietary tool — no public signup.

### Directory structure

```
app/
├── (auth)/login/         # Login page (email+password, no signup)
├── (dashboard)/          # Protected routes — requires auth
│   ├── layout.tsx        # Dashboard shell + Header + User upsert
│   ├── dashboard/        # Tab 1: Real-time open positions (Phase 5)
│   ├── research/         # Tab 2: Analytics + charts (Phase 6)
│   ├── search/           # Tab 3: Trade search (Phase 8)
│   ├── profile/          # User profile
│   └── settings/         # IBKR, Polygon, AI settings (Phase 3+)
├── auth/callback/        # Supabase auth callback route
└── api/
    └── cron/             # Cron job endpoints (Phase 3+)

components/               # Shared UI components
lib/
├── supabase/
│   ├── server.ts         # createClient() — Server Components (anon key + RLS)
│   ├── client.ts         # createClient() — Client Components (browser, anon key)
│   └── admin.ts          # createAdminClient() — service-role, bypasses RLS
├── db/
│   └── types.ts          # Generated Database type from Supabase MCP
├── trade/
│   └── fifo.ts           # Pure FIFO matching function
├── ibkr/
│   └── parse-date.ts     # IBKR Flex date parser
└── utils/
    ├── cn.ts             # Tailwind class merge
    └── calculations.ts   # calcStats, equityCurve, rDistribution, setupPerformance

scripts/
└── seed.ts               # Seeds 27 synthetic trades via service-role client

types/
└── trade.ts              # Domain types: NormalizedExecution, FifoAction, ClosedTrade, ...
```

### Data flow

```
Supabase Auth → middleware.ts → protected routes
                                    ↓
                              DashboardLayout
                              (server, checks session, upserts User row)
                                    ↓
                              Header + Tab content
```

### Key design decisions

- **Auth**: Supabase email+password. Login page only — no signup. Account created manually in Supabase dashboard.
- **DB access**: Supabase JS client (`@supabase/ssr` for server, `@supabase/supabase-js` for browser/scripts). NO ORM. Type safety via the generated `Database` type in `lib/db/types.ts`.
- **Migrations**: Applied through Supabase MCP `apply_migration`. The `_prisma_migrations` table is a leftover from initial bootstrap — kept as an audit row, not used by any tooling.
- **Single user**: No multi-user architecture. RLS enabled and used on every table.
- **RTL**: `<html dir="rtl" lang="he">` at root layout.
- **Polygon**: Free tier (15 min delayed, 5 calls/min). Use Snapshot endpoint for batch ticker lookups.
- **IBKR**: Flex Web Service — 2-step pull (request → download). Token valid ~1 year.
- **Encryption**: IBKR Flex token encrypted AES-256-GCM. Key from env only.

### Theme

| Variable | Value | Use |
|----------|-------|-----|
| `--bg-dark` | `#080808` | Page background |
| `--panel-bg` | `#111111` | Panel backgrounds |
| `--border` | `#222222` | Borders |
| `--green` | `#2CC84A` | Win / positive |
| `--red` | `#FF4D4D` | Loss / negative |
| `--amber` | `#FFB800` | Accent / warning |
| `--text-main` | `#E0E0E0` | Primary text |
| `--text-dim` | `#888888` | Secondary text |

Fonts: **IBM Plex Mono** (numbers, mono) + **Assistant** (UI, Hebrew)

### DB schema highlights

- `Trade` + `Order` — FIFO-based. Each execution = one Order. Trade aggregates multiple Orders.
- `Order.brokerExecId` — UNIQUE. Global idempotency key for IBKR dedup.
- `Order.brokerOrderId` — NOT unique. Groups partial fills (same order, multiple ExecIDs).
- `BrokerEvent` — raw XML audit log for every IBKR fetch.
- `BrokerConnection.flexTokenEncrypted` — AES-256-GCM, never returned in API responses.
- All app tables have RLS policies of the form `auth.uid() = "userId"` (or `= "id"` on `User`).

### IBKR date parsing (CRITICAL)

IBKR Flex uses `dd/MM/yyyy;HH:mm:ss TimeZone` format (e.g., `23/04/2026;14:30:00 EST`).
`new Date()` cannot parse this. `date-fns parse()` also won't work because it creates dates in LOCAL timezone. Use manual component parsing + `Date.UTC()` — see [lib/ibkr/parse-date.ts](lib/ibkr/parse-date.ts).
Tests in [__tests__/parse-date.test.ts](__tests__/parse-date.test.ts) cover all US timezones (EST/EDT/CST/CDT/PST/PDT) + DST transitions.

### Phase 2 — DB Models + FIFO Logic (COMPLETE)

- `lib/supabase/{server,client,admin}.ts` — three Supabase clients (anon-server, anon-browser, service-role)
- `lib/db/types.ts` — generated `Database` type
- `lib/ibkr/parse-date.ts` — IBKR Flex date parser
- `lib/utils/calculations.ts` — calcStats, equityCurve, rDistribution, setupPerformance
- `lib/trade/fifo.ts` — `matchExecution()` pure FIFO function
- `types/trade.ts` — domain types
- `scripts/seed.ts` — 27 synthetic trades for dev seeding
- `__tests__/{parse-date,calculations,fifo}.test.ts` — 20 + 17 + 22 unit tests
- `__tests__/integration/fifo-to-db.test.ts` — 2 integration tests against real Supabase

DB objects (via Supabase MCP migrations):
- `phase2_initial_schema` — 7 tables, RLS enabled on all 6 app tables
- `phase2_reverse_position_fn` — atomic close+open Postgres function for FIFO REVERSAL

**Test status**: 61/61 pass. Build (TypeScript gate) clean.

### FIFO logic notes

- `matchExecution(exec, openTrade)` returns a `FifoAction` discriminated union: `OPEN | SCALE_IN | REDUCE | CLOSE | REVERSAL`
- All arithmetic uses plain `number` (Postgres NUMERIC columns are returned by Supabase as `number`)
- **REVERSAL** produces two DB writes — callers MUST persist them via `supabase.rpc('reverse_position', {...})` so they happen in one Postgres transaction
- `rDistribution` uses left-inclusive bins: `[min, max)`. r=0 → "0R–1R", r=2 → ">2R"
- `actualR` is null when stopPrice is null OR riskPerShare < 0.0001 (prevents Infinity/NaN)

### Supabase typing notes

`@supabase/ssr` v0.6.x's `createServerClient<Database>` does not propagate the `Database` generic correctly to `from()`/`upsert()` callsites — TypeScript narrows the values param to `never`. The runtime is fine. Workaround: `lib/supabase/server.ts` casts the return to `SupabaseClient<Database>`. Remove the cast once the upstream type is fixed.
