# Trade Analysis — Handoff to Session 4

**Status**: Phases 0–3 complete. Ready for Phase 4 (Polygon price updates).
**Branch**: `main` (work directly on main, no feature branches for this single-user proprietary tool)
**Remote**: `https://github.com/avi720/--Trade-Analyst2.git` — pushed, up to date

---

## Project

**Trade Analysis** — Hebrew RTL trading journal with AI (Next.js 14 + Supabase + IBKR Flex + Polygon + Gemini).

- **Currently single-user** (no signup UI; account created manually in Supabase dashboard).
- **Future plan: SaaS** — DB is already multi-user ready (`userId` FK + RLS on every app table). Don't add single-user shortcuts.
- Hosted on **Render** (planned: 1 Web Service + Cron Jobs). Render not yet deployed — `render.yaml` exists in repo, env vars to be set in Render dashboard.

---

## Environment & Machine Quirks

- **OS**: Windows 11 Pro on **ARM64** (Snapdragon / Surface-class). Node.js at `D:\Program Files\Node` is the **native ARM64** build.
- **Project path**: `D:\avipa\Documents\Programming\‏‏Trade Analyst` (RTL marks in "Trade").
- **Shell**: Git Bash / MINGW64 — `npm` not on PATH there. Use **PowerShell** (`$env:Path = "D:\Program Files\Node;" + $env:Path`) to run npm commands.
- **Windows build fix**: `NEXT_TELEMETRY_DISABLED=1 npm run build` to avoid `EXDEV: cross-device link not permitted` (already in scripts).
- **No Prisma** — eliminated in session 2 due to ARM64 incompatibility. Use Supabase JS SDK directly.

---

## External Services

| Service | Status | Notes |
|---------|--------|-------|
| Supabase | ✅ Connected via MCP | Project ID: `nwvswntqrqqtwzrhzpmi` |
| Polygon | Keys in `.env.local` | Free tier — 15 min delayed, 5 calls/min. **Phase 4 — next.** |
| Gemini | Keys in `.env.local` | `gemini-2.0-flash`. Phase 7. |
| IBKR Flex | ✅ Integrated + tested | Token + 2 query IDs configured locally. Backfill ran successfully. |
| GitHub | Pushed | `https://github.com/avi720/--Trade-Analyst2` |
| Render | Not yet deployed | `render.yaml` ready; env vars to set in dashboard |

---

## `.env.local` (on disk, not in git)

```env
NEXT_PUBLIC_SUPABASE_URL=https://nwvswntqrqqtwzrhzpmi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
FLEX_TOKEN_ENCRYPTION_KEY=<32-byte hex>
MASSIVE_API_KEY=<filled — Phase 4 will use it>
GEMINI_API_KEY=<filled>
CRON_SECRET=<random string — for cron endpoint auth>
```

`CRON_SECRET` was added in Phase 3 and is required for the IBKR cron route.

---

## Phase 3 — IBKR Flex Web Service Integration (DONE)

### DB Migrations (via Supabase MCP `apply_migration`)

1. **`phase3_backfill_status`** — adds `lastBackfillStatus TEXT` and `lastBackfillError TEXT` to `BrokerConnection` for tracking async backfill state (`RUNNING` / `SUCCESS` / `ERROR`).
2. **`phase3_reverse_position_fn`** — atomic Postgres function for FIFO REVERSAL (close + open in one transaction). Note: an older 5-param overload from an earlier attempt still exists — **always use the 11-param `p_`-prefixed version**:
   ```typescript
   await supabase.rpc('reverse_position', {
     p_close_trade_id, p_close_status, p_close_at,
     p_avg_exit_price, p_actual_r, p_result,
     p_realized_pnl, p_total_commission,
     p_close_order, p_new_trade, p_new_order,
   })
   ```

### New library code (`lib/ibkr/`)

| File | Purpose |
|------|---------|
| `encrypt.ts` | AES-256-GCM encrypt/decrypt for the Flex token. Key from `FLEX_TOKEN_ENCRYPTION_KEY` env (64-char hex = 32 bytes). Format: `iv:authTag:ciphertext` (hex, colon-separated). Throws clearly on missing/wrong-length key. |
| `flex-client.ts` | `fetchFlexQuery(token, queryId)` — 2-step Flex Web Service HTTP client. Step 1 → `https://www.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest`. Step 2 → URL from Step 1 response. Retries Step 2 up to 5× with 2s backoff while statement is being prepared. **`parse-date.ts` already in repo handles the `dd/MM/yyyy;HH:mm:ss TZ` format**. |
| `parse-flex-xml.ts` | Uses `fast-xml-parser`. Exports `parseTradeConfirmXml()` (Trade Confirmations query, path: `FlexStatements → FlexStatement → TradeConfirms → TradeConfirm[]`), `parseActivityXml()` (Activity query, path: `FlexStatements → FlexStatement → Trades → Trade[]`), and `validateStk()`. Returns `NormalizedExecution[]`. Skips (with `console.warn`) any execution with missing `ExecID`, missing `Symbol`, invalid `Buy/Sell`, or unparseable `Date/Time` — does NOT crash the batch. |
| `process-executions.ts` | Main pipeline. `processExecutions(executions, userId)` per-execution: dedup check on `Order.brokerExecId` → `validateStk` → load open `Trade` for ticker → `matchExecution()` → persist by FifoAction. REVERSAL goes through `supabase.rpc('reverse_position', ...)`. Returns `ExecutionResult[]` with status per exec (`PROCESSED` / `SKIPPED_DUPLICATE` / `REJECTED_NON_STOCK` / `FAILED`). |

### CRITICAL bug fixed during testing

`parseStep1Xml` originally looked for root element `FlexStatementOperationMessage`, but **IBKR returns `FlexStatementResponse` for successful Step 1 responses** and only uses `FlexStatementOperationMessage` for errors. Fixed to handle both.

Successful Step 1 XML structure:
```xml
<FlexStatementResponse timestamp='27 April, 2026 04:33 AM EDT'>
  <Status>Success</Status>
  <ReferenceCode>5662666785</ReferenceCode>
  <Url>https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement</Url>
</FlexStatementResponse>
```

### API routes (`app/api/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ibkr/connect` | POST | Save/upsert `BrokerConnection`. Validates with Zod (`pollingIntervalMin >= 15`). Encrypts token before storage. Never returns the token. |
| `/api/ibkr/connection` | GET | Returns current connection status (timestamps + status fields, NOT the token). Used by settings UI and `SyncIndicator`. |
| `/api/ibkr/test-connection` | POST | Tests both queries in parallel via `fetchFlexQuery`. Returns `{ query1, query2, firstSuccess }`. `firstSuccess` is true only on the first dual-success ever (no `lastSyncAt`, no `lastBackfillAt`). |
| `/api/ibkr/backfill` | POST | Triggers async Activity backfill (Query 2). Sets `lastBackfillStatus = 'RUNNING'`, returns 202 immediately, runs `setImmediate(...)` to fetch + process. **Works on Render persistent Node process; does NOT work on Vercel serverless.** |
| `/api/ibkr/backfill` | GET | Polled by settings UI while running. Returns `{ status, lastBackfillAt, error }`. |
| `/api/cron/ibkr-sync` | GET | Render Cron Job endpoint. Secured with `Authorization: Bearer ${CRON_SECRET}` header. Loads single active `BrokerConnection`, skips if `now - lastSyncAt < pollingIntervalMin × 60_000`, otherwise fetches Query 1, parses, processes, updates `lastSyncAt` / `lastSyncStatus` / `lastSyncError`. |

### UI

- **`app/(dashboard)/settings/page.tsx`** — full IBKR settings form replacing the placeholder. Includes:
  - Collapsible setup guide listing the 20 required Flex fields, with formatted instructions in Hebrew.
  - Form: Flex Token (password input, blank means "keep existing"), Query ID Trades, Query ID Activity, polling interval (min 15).
  - "שמור" + "Test Connection" buttons.
  - "Run Activity Backfill" button + RUNNING spinner + 2-second polling of GET `/api/ibkr/backfill`.
  - Sync status display: relative time + status color (green/red/gray).
  - Phase 4 / 7 / 8 stub sections preserved at the bottom.
- **`components/sync-indicator.tsx`** — replaces placeholder. Fetches `/api/ibkr/connection` on mount + every 60s. Dot color:
  - Green: `lastSyncAt` within `2 × pollingIntervalMin`
  - Amber: between `2×` and `5×`
  - Red: beyond `5×` or null
  - Tooltip shows full ISO timestamp + status.
  - Polygon dot is still gray placeholder — Phase 4 will wire it up.

### `render.yaml` (created, not yet deployed)

```yaml
services:
  - type: web
    name: trade-analyst
    runtime: node
    buildCommand: npm ci && npm run build
    startCommand: npm run start
    plan: starter   # Free tier sleeps and breaks cron reliability
    envVars: [...sync: false for all secrets...]

  - type: cron
    name: ibkr-sync
    runtime: image
    schedule: "*/15 * * * *"
    image: { url: docker.io/curlimages/curl:8.7.1 }
    command: >
      curl --silent --show-error --fail
      --header "Authorization: Bearer $CRON_SECRET"
      "$RENDER_EXTERNAL_URL/api/cron/ibkr-sync"
```

### Tests

- `__tests__/flex-xml.test.ts` — 18 tests for XML parsers (BUY, SELL, SSHORT, partial fills, non-STK rejection, missing ExecID, unknown TZ, empty response, malformed XML, mixed valid/invalid).
- `__tests__/process-executions.test.ts` — 8 pipeline unit tests with mocked Supabase admin client (OPEN, SKIPPED_DUPLICATE, REJECTED_NON_STOCK, CLOSE, REVERSAL with rpc check, error handling, multi-execution batch).

**Status: 86/86 tests pass. Build clean.**

### Type changes

- `types/trade.ts` — added `assetClass?: string` to `NormalizedExecution` (used by `validateStk`).

---

## Pending Before Phase 4

- [ ] **Deploy to Render** — `render.yaml` is ready, but env vars need to be set in Render dashboard, including `CRON_SECRET`. The cron job will only fire after deployment.
- [ ] Optional: confirm the IBKR cron endpoint actually fires when called externally (test with `curl -H "Authorization: Bearer ..." https://<render-url>/api/cron/ibkr-sync`).
- [ ] Optional: verify the seed (`npm run db:seed`) still works on the live DB after Phase 3 schema additions.

---

## Phase 4 — Polygon Price Updates (NEXT)

From `trade-analysis-prompt.md`:
- Update `Trade.lastKnownPrice` + `lastPriceUpdateAt` for every **open** position.
- Polling interval: user-configurable (`BrokerConnection.pricePollingIntervalMin`, min 15, default 15, **independent** of IBKR polling).
- Free Polygon tier: 5 calls/min, 15 min delayed prices. Snapshot endpoint can batch lookup (preferred over per-ticker calls).
- Triggered by:
  1. New Render Cron Job (`pricePollingIntervalMin`-based, will need a 2nd cron entry in `render.yaml`).
  2. On-demand fetch from the live dashboard if interval has elapsed (Phase 5 wires this up too).

Things to design:
- Polygon HTTP client (`lib/polygon/client.ts`) — Snapshot endpoint, error handling, rate-limit awareness.
- Cron route (`app/api/cron/polygon-prices/route.ts`) — secured with `CRON_SECRET`, reads open positions, batches by ticker, updates `Trade` rows.
- UI: settings section for `pricePollingIntervalMin`, "מחיר עודכן לפני X דקות" indicator on dashboard, SyncIndicator's Polygon dot wired to a new `lastPriceUpdateAt` aggregate (e.g., min over open positions).
- Data freshness banner: amber if all open positions have stale prices.

---

## Full Roadmap

| Phase | Content | Status |
|-------|---------|--------|
| 0 | Planning | ✅ Done |
| 1 | Foundation — Next.js + Auth + Layout | ✅ Done |
| 2 | DB Models + FIFO Logic + Tests | ✅ Done (no ORM, Supabase SDK) |
| 3 | IBKR Flex Integration + Cron | ✅ Done |
| 4 | Polygon Price Updates | 🔲 Next |
| 5 | Real-Time Dashboard | 🔲 |
| 6 | Research Dashboard | 🔲 |
| 7 | AI Chat (Hanan, server-side) | 🔲 |
| 8 | Search + Polish | 🔲 |

**Rule: do not start a new phase without explicit approval.**
