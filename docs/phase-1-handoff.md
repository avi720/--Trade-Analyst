# Trade Analysis — Handoff to Session 3

**Status**: Phase 0 + Phase 1 complete. Ready for Phase 2.
**Branch**: `main` (worktree deleted, work is directly on main)
**Last commit**: `894e767` — *Phase 1: Next.js 14 foundation — replace React SPA with full-stack app*
**Remote**: `https://github.com/avi720/--Trade-Analyst2.git` — pushed, up to date

---

## Project

**Trade Analysis** — Hebrew RTL trading journal with AI (Next.js 14 + Supabase + Prisma + IBKR Flex + Polygon + Gemini).

- **Personal tool** — single user, no public signup. Account created manually in Supabase.
- **Rewrite in same repo** — old React/Vite SPA replaced entirely.
- Hosted on **Render** (1 Web Service + 2 Cron Jobs).

---

## Environment & Machine Quirks

- **OS**: Windows 11, bash via Git Bash.
- **Project path**: `D:\avipa\Documents\Programming\‏‏Trade Analyst2` (contains RTL marks in "Trade").
- **Node.js path**: `/d/Program Files/Node/` — not in default PATH. Before npm commands:
  ```bash
  export PATH="/d/Program Files/Node:$PATH"
  ```
- **Windows build fix**: always use
  ```bash
  NEXT_TELEMETRY_DISABLED=1 npm run build
  ```
  otherwise fails with `EXDEV: cross-device link not permitted`.
- **ESLint version**: pinned to `^8.57.1`. Next.js 14 rejects ESLint 9.
- **next.config**: `.mjs` only — Next.js 14 rejects `.ts` config files.

---

## External Services

| Service | Status | Notes |
|---------|--------|-------|
| Supabase | ✅ Connected via MCP | Project ID: `nwvswntqrqqtwzrhzpmi` |
| Polygon | Keys in `.env.local` | Free tier — 15 min delayed, 5 calls/min. Use Snapshot endpoint |
| Gemini | Keys in `.env.local` | `gemini-2.0-flash` |
| IBKR Flex | Not yet integrated | Phase 3 |
| GitHub | Pushed | `https://github.com/avi720/--Trade-Analyst2` |
| Render | Not yet deployed | Optional before Phase 2 |

**Supabase MCP** is operational — use `apply_migration`, `execute_sql`, `list_tables`, `generate_typescript_types`, `get_advisors`, `deploy_edge_function`, `get_logs` directly. No need for `npx prisma migrate deploy` against remote.

---

## `.env.local` (on disk, not in git)

```env
NEXT_PUBLIC_SUPABASE_URL=https://nwvswntqrqqtwzrhzpmi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_q7Um2e9p7tYPpv6oTxJ8Pw_wD2DzSHK
SUPABASE_SERVICE_ROLE_KEY=<user filled>
DATABASE_URL=<user filled>
DIRECT_URL=<user filled>
FLEX_TOKEN_ENCRYPTION_KEY=a25ae8eb06de1944db5daa86c2467f93069403ae7bb8352699e15ef9ef0734ed
MASSIVE_API_KEY=<user filled>
GEMINI_API_KEY=<user filled>
```

- `sb_publishable_...` is the new Supabase publishable key format (preferred over legacy anon JWT).
- `FLEX_TOKEN_ENCRYPTION_KEY` — 32-byte hex, generated via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

---

## Directory Structure

```
app/
  (auth)/login/page.tsx          ← Login form, lazy Supabase import (SSR fix)
  (dashboard)/
    layout.tsx                   ← Server-side auth gate, renders Header
    dashboard/page.tsx           ← Placeholder (Phase 5)
    research/page.tsx            ← Placeholder (Phase 6)
    search/page.tsx              ← Placeholder (Phase 8)
  auth/callback/route.ts         ← Supabase auth callback
  globals.css                    ← CSS vars, RTL setup
  layout.tsx                     ← Root layout: dir="rtl" lang="he"
  page.tsx                       ← Root — redirects to /dashboard

components/
  header.tsx                     ← 3-tab nav, SyncIndicator, user dropdown
  sync-indicator.tsx             ← Placeholder (wired Phase 3+4)

lib/
  supabase/
    client.ts                    ← Browser client
    server.ts                    ← Server client with cookies
  utils/
    cn.ts                        ← clsx + tailwind-merge helper

prisma/
  schema.prisma                  ← Full schema (NOT yet migrated to DB)

middleware.ts                    ← Auth protection
next.config.mjs                  ← serverComponentsExternalPackages: ['@prisma/client']
tailwind.config.ts
tsconfig.json
vitest.config.ts
vitest.setup.ts
package.json
CLAUDE.md                        ← Architecture docs (read me first in new session)
README.md
.env.local                       ← local only, not in git
docs/
  session-2-handoff.md           ← this file
```

**Note**: a leftover `dist/` folder from the old Vite build may still exist — safe to delete.

---

## Dependencies (`package.json`)

```json
"dependencies": {
  "next": "14.2.29",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "@supabase/ssr": "^0.5.2",
  "@supabase/supabase-js": "^2.49.4",
  "@prisma/client": "^6.6.0",
  "date-fns": "^4.1.0",
  "fast-xml-parser": "^4.5.3",
  "zod": "^3.24.2",
  "recharts": "^2.15.3",
  "xlsx": "^0.18.5",
  "@google/generative-ai": "^0.24.0",
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.6.0",
  "lucide-react": "^0.487.0"
},
"devDependencies": {
  "typescript": "^5.8.3",
  "@types/node": "^22.14.1",
  "@types/react": "^18.3.21",
  "@types/react-dom": "^18.3.5",
  "tailwindcss": "^3.4.17",
  "postcss": "^8.5.3",
  "autoprefixer": "^10.4.21",
  "prisma": "^6.6.0",
  "vitest": "^3.1.2",
  "@vitejs/plugin-react": "^4.4.1",
  "@testing-library/react": "^16.3.0",
  "@testing-library/jest-dom": "^6.6.3",
  "eslint": "^8.57.1",
  "eslint-config-next": "14.2.29"
}
```

---

## Prisma Schema (defined, NOT yet migrated)

```prisma
model User {
  id               String            @id @default(uuid())
  email            String            @unique
  name             String?
  settings         Json              @default("{}")
  createdAt        DateTime          @default(now())
  brokerConnection BrokerConnection?
  trades           Trade[]
  conversations    AIConversation[]
  brokerEvents     BrokerEvent[]
}

model BrokerConnection {
  id                      String    @id @default(uuid())
  userId                  String    @unique
  brokerName              String    // "IBKR_FLEX"
  accountId               String?
  flexTokenEncrypted      String    // AES-256-GCM encrypted
  flexQueryIdTrades       String    // Query 1 — Trade Confirmations (polling)
  flexQueryIdActivity     String    // Query 2 — Activity (backfill)
  pollingIntervalMin      Int       @default(15)
  pricePollingIntervalMin Int       @default(15)
  lastSyncAt              DateTime?
  lastSyncStatus          String?
  lastSyncError           String?
  lastBackfillAt          DateTime?
  isActive                Boolean   @default(true)
  user                    User      @relation(fields: [userId], references: [id])
}

model Trade {
  id                  String    @id @default(uuid())
  userId              String
  ticker              String
  assetType           String    @default("STK")
  direction           String    // "Long" | "Short"
  status              String    // "Open" | "Closed"
  setupType           String?
  openedAt            DateTime
  closedAt            DateTime?
  avgEntryPrice       Decimal
  avgExitPrice        Decimal?
  totalQuantity       Decimal
  totalQuantityOpened Decimal
  multiplier          Int       @default(1)
  stopPrice           Decimal?
  targetPrice         Decimal?
  rMultipleEntry      Decimal?
  actualR             Decimal?
  realizedPnl         Decimal?
  totalCommission     Decimal?
  lastKnownPrice      Decimal?
  lastPriceUpdateAt   DateTime?
  executionQuality    Int?
  emotionalState      String?
  result              String?
  didRight            String?
  wouldChange         String?
  notes               String?
  externalRefId       String?
  user                User      @relation(fields: [userId], references: [id])
  orders              Order[]
  @@index([userId, status])
  @@index([userId, ticker])
}

model Order {
  id                    String    @id @default(uuid())
  tradeId               String
  side                  String    // "BUY" | "SELL"
  quantity              Decimal
  price                 Decimal
  proceeds              Decimal?
  netCash               Decimal?
  commission            Decimal?
  commissionCurrency    String?
  tax                   Decimal?
  currency              String?
  exchange              String?
  orderType             String?
  executedAt            DateTime
  orderTime             DateTime?
  tradeDate             DateTime?
  brokerExecId          String    @unique  // IBKR ExecID — idempotency key
  brokerOrderId         String?            // NOT unique — groups partial fills
  brokerTradeId         String?
  brokerClientAccountId String?
  rawPayload            Json
  trade                 Trade     @relation(fields: [tradeId], references: [id])
  @@index([executedAt])
  @@index([brokerOrderId])
  @@index([brokerTradeId])
}

model BrokerEvent {
  id               String    @id @default(uuid())
  userId           String
  source           String    // "IBKR_FLEX"
  receivedAt       DateTime  @default(now())
  eventType        String    // "FLEX_FETCH" | "EXECUTION" | "BACKFILL_CHUNK"
  rawPayload       Json
  processingStatus String    // "PENDING" | "PROCESSED" | "FAILED" | "SKIPPED_DUPLICATE" | "REJECTED_NON_STOCK"
  processingError  String?
  processedAt      DateTime?
  user             User      @relation(fields: [userId], references: [id])
  @@index([userId, receivedAt])
  @@index([processingStatus])
}

model AIConversation {
  id          String   @id @default(uuid())
  userId      String
  contextType String   // "realtime" | "research"
  messages    Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id])
}
```

---

## Key Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Auth | Supabase login-only, no signup | Personal tool; account created manually |
| Supabase key | `sb_publishable_...` | Preferred over legacy anon JWT |
| DB migrations | Supabase MCP `apply_migration` | MCP is connected |
| Polygon tier | Free (15 min delayed) | Snapshot endpoint — single call for all tickers |
| IBKR queries | Query 1 polling, Query 2 backfill | Two separate Flex queries |
| IBKR date parsing | `date-fns` `parse()` with `dd/MM/yyyy;HH:mm:ss` | `new Date()` cannot parse IBKR format |
| Flex token storage | AES-256-GCM with env key | Never returned in API responses |
| Currency | USD only (MVP) | Field kept in schema for future |
| Migration from old app | None | Starting fresh |
| Hosting | Render (1 Web + 2 Cron) | No Docker, no private network |

---

## Bugs Fixed in Phase 1

1. **ESLint 9 conflict** → pinned `^8.57.1`.
2. **`next.config.ts` rejected** → renamed `.mjs` with JSDoc types.
3. **Windows EXDEV on build** → `NEXT_TELEMETRY_DISABLED=1`.
4. **TypeScript strict `any` on `cookiesToSet`** → imported `CookieOptions` from `@supabase/ssr`, explicit type.
5. **Supabase prerender crash on `/login`** → lazy `import('@/lib/supabase/client')` inside event handlers (`handleSubmit` in login, `handleSignOut` in header).
6. **Node.js not in PATH** → `export PATH="/d/Program Files/Node:$PATH"`.

---

## Housekeeping Done Post-Phase-1

- Worktree `cool-davinci-e5722e` removed; branch deleted.
- `main` reset to include all Phase 1 work, pushed to GitHub.
- `.env.local` and `.claude/settings.local.json` (Claude Code permissions) copied to main project directory.

---

## Pending Before Phase 2

- [ ] Verify user exists in Supabase Authentication dashboard (manual email/password).
- [ ] Run `npm install` and `npm run dev` in main directory — confirm login flow works.
- [ ] Delete leftover `dist/` folder (from old Vite build) if still present.
- [ ] Optionally deploy to Render.

---

## Phase 2 Work Plan

1. **Apply Prisma migration** via Supabase MCP `apply_migration` (convert `prisma/schema.prisma` to SQL).
2. **`npx prisma generate`** locally for typed client.
3. **Port `calculations.js` → TypeScript** → `lib/utils/calculations.ts`:
   - `calcStats()` — win rate, avg R, profit factor
   - `equityCurve()` — cumulative R over time
   - `rDistribution()` — R histogram bins
   - `setupPerformance()` — win rate by setup type
4. **FIFO trade matching** → `lib/trade/fifo.ts`, pure function with exhaustive Vitest tests:
   - Long, short (including SSHORT)
   - Scaling in/out
   - Reversal (long → short in one session)
   - Partial fills (same `brokerOrderId`, different `brokerExecId`)
   - Same-day round trips
   - Commission + net P&L
5. **IBKR date parsing** → `lib/ibkr/parse-date.ts` with tests for EST/EDT/CST/CDT/PST/PDT + DST transitions.
6. **Seed data** — 20–30 synthetic trades covering all FIFO cases.
7. **User record upsert** — after Supabase Auth login, create `User` row in Prisma DB (upsert on first login or via DB trigger).

---

## Full Roadmap

| Phase | Content | Status |
|-------|---------|--------|
| 0 | Planning | ✅ Done |
| 1 | Foundation — Next.js + Auth + Layout | ✅ Done |
| 2 | DB Models + FIFO Logic + Tests | 🔲 Next |
| 3 | IBKR Flex Integration + Cron | 🔲 |
| 4 | Polygon Price Updates | 🔲 |
| 5 | Real-Time Dashboard | 🔲 |
| 6 | Research Dashboard | 🔲 |
| 7 | AI Chat (Hanan, server-side) | 🔲 |
| 8 | Search + Polish | 🔲 |

**Rule: do not start a new phase without explicit approval.**
