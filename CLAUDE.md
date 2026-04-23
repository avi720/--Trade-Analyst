# CLAUDE.md — Trade Analysis

## Commands

```bash
npm run dev       # Dev server (http://localhost:3000)
npm run build     # Production build
npm run start     # Start production server
npm run test      # Run tests (Vitest)
npm run test:run  # Run tests once (CI mode)
npx prisma migrate dev --name <name>  # Create migration
npx prisma generate                   # Regenerate Prisma client
npx prisma studio                     # DB GUI
```

## Architecture

**Trade Analysis** is a Hebrew RTL trading journal with AI (Next.js 14 App Router + Supabase + Prisma).
Single-user proprietary tool — no public signup.

### Directory structure

```
app/
├── (auth)/login/         # Login page (email+password, no signup)
├── (dashboard)/          # Protected routes — requires auth
│   ├── layout.tsx        # Dashboard shell + Header
│   ├── dashboard/        # Tab 1: Real-time open positions (Phase 5)
│   ├── research/         # Tab 2: Analytics + charts (Phase 6)
│   ├── search/           # Tab 3: Trade search (Phase 8)
│   ├── profile/          # User profile
│   └── settings/         # IBKR, Polygon, AI settings (Phase 3+)
├── auth/callback/        # Supabase auth callback route
└── api/
    └── cron/             # Cron job endpoints (Phase 3+)
        ├── ibkr-sync/    # IBKR Flex polling
        └── price-update/ # Polygon price polling

components/               # Shared UI components
lib/
├── supabase/
│   ├── server.ts         # createClient() for Server Components
│   └── client.ts         # createClient() for Client Components
└── utils/
    └── cn.ts             # Tailwind class merge utility

prisma/
└── schema.prisma         # Full DB schema
```

### Data flow

```
Supabase Auth → middleware.ts → protected routes
                                    ↓
                              DashboardLayout
                              (server, checks session)
                                    ↓
                              Header + Tab content
```

### Key design decisions

- **Auth**: Supabase email+password. Login page only — no signup. Account created manually in Supabase dashboard.
- **Single user**: No multi-user architecture. RLS enabled as good practice.
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

### Business logic to preserve (from v1)

| Function | Location (Phase 2) | Description |
|----------|--------------------|-------------|
| `calcStats()` | `lib/calculations.ts` | Win rate, avg R, profit factor |
| `equityCurve()` | `lib/calculations.ts` | Cumulative R over time |
| `rDistribution()` | `lib/calculations.ts` | R histogram bins |
| `setupPerformance()` | `lib/calculations.ts` | Win rate by setup type |
| `callGemini()` | `lib/gemini.ts` (server) | Gemini API with exponential backoff |
| `parseAIResponse()` | `lib/gemini.ts` | Extract JSON from AI response |
| Hebrew export | `lib/export.ts` | CSV + Excel with Hebrew headers |

### DB schema highlights

- `Trade` + `Order` — FIFO-based. Each execution = one Order. Trade aggregates multiple Orders.
- `Order.brokerExecId` — UNIQUE. Global idempotency key for IBKR dedup.
- `Order.brokerOrderId` — NOT unique. Groups partial fills (same order, multiple ExecIDs).
- `BrokerEvent` — raw XML audit log for every IBKR fetch.
- `BrokerConnection.flexTokenEncrypted` — AES-256-GCM, never returned in API responses.

### IBKR date parsing (CRITICAL)

IBKR Flex uses `dd/MM/yyyy;HH:mm:ss TimeZone` format (e.g., `23/04/2026;14:30:00 EST`).
`new Date()` cannot parse this. Use `date-fns` `parse()` with explicit format string.
Tests required for all US timezones (EST/EDT/CST/CDT/PST/PDT) + DST transitions.
