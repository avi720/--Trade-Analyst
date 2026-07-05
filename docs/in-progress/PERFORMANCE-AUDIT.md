# Trade Analyst — Performance Audit & Remediation Plan

> **Audit date:** 2026-06-19
> **Auditor:** Claude (engineering:code-review skill)
> **App version reviewed:** `main` branch at commit `c6e2b35` + production at https://trade-analyst-lyart.vercel.app

---

## Background

Trade Analyst is a Hebrew-RTL trading journal for self-directed equity traders, built on Next.js 16 (App Router) + React 19 + Supabase Postgres with RLS. It pulls trade executions from IBKR's Flex Web Service, normalises them through a FIFO matching pipeline, and serves a research dashboard plus an AI chat assistant ("חנן", Gemini-backed). The app is deployed single-user today but architected multi-user at the DB layer per the invariant in `CLAUDE.md`, so all performance findings are framed against a power-user dataset (thousands of trades, hundreds of executions per IBKR sync) — not a single-trade demo.

**Scope:** Runtime performance of the live request paths — IBKR ingest, FIFO matching, research-dashboard render loop, trade-search render loop, AI chat context plumbing, and the cron handlers. Out of scope: correctness, security, and dependency hygiene (covered in [`docs/TECH-DEBT.md`](TECH-DEBT.md)); UI polish (covered in [`docs/UI-AUDIT.md`](UI-AUDIT.md)); cold-start / bundle-size analysis (not a current pain point on Vercel).

**Stack reviewed:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase JS 2.x · `@supabase/ssr` · `@google/genai` (Gemini 2.5 Flash + Pro) · `recharts` · `exceljs` · `fast-xml-parser` · Vercel hosting · GitHub Actions cron.

**Methodology:**
1. Full source read of the IBKR ingest path: `lib/ibkr/process-executions.ts`, `lib/ibkr/parse-flex-xml.ts`, `lib/ibkr/flex-client.ts`, `app/api/cron/ibkr-sync/route.ts`, `app/api/trades/import/route.ts`.
2. Full source read of the manual-entry ingest path: `app/api/trades/manual/route.ts`, `app/api/trades/manual/closed/route.ts`, `lib/trade/manual-entry.ts`.
3. Full source read of the research surface: `components/research-dashboard.tsx`, `components/research/*.tsx`, `lib/utils/research-charts.ts`, `lib/utils/calculations.ts`, `components/trade-search.tsx`.
4. Full source read of the chat surface: `app/api/chat/route.ts`, `lib/chat/gemini-client.ts`, `lib/chat/chat-context.tsx`.
5. Grep sweeps for: `select('*'`, `JSON.stringify`, `for (const ... of` followed by `await`, sequential `await admin.from(...)` patterns, missing `useMemo` / `memo` in heavy components.
6. Cross-referenced findings against `CLAUDE.md` invariants — particularly the per-ticker FIFO ordering rule that bounds where parallelism is safe in `processExecutions`.
7. Each finding scored internally with `Priority = (Impact + Risk) × (6 − Effort)`, all on a 1-5 scale, to order within phases.

**Reference frameworks:**
- Project-internal invariants documented in `CLAUDE.md` (FIFO concurrency rules, per-user RLS, IBKR rate-limit shape)
- Core Web Vitals — INP for client interactivity under keystroke load
- Standard Postgres / Supabase JS access patterns (avoid N+1, prefer `in`-batched selects)
- React 19 rendering model — referential stability of context values, `useMemo` / `memo` boundaries
- Vercel serverless execution envelope (`maxDuration`, `waitUntil`)

---

## How to Use This Plan

- Each finding is **outcome-driven**: it states what is wrong and what "fixed" looks like, but **not** how to implement it. The implementer chooses the approach.
- Work top-down by phase. **Do not skip Phase 1.** Phase 1 contains paths that already hurt a real user with a moderate dataset.
- Tick the box only when the **Acceptance** clause is satisfied — not when the change is merely written. All Acceptance clauses here demand a measurement (timing, allocation count, payload bytes) rather than a code-shape change.
- When an item lands, flip `[ ]` → `[x]` on the heading line. Empty boxes mean unfinished; ticked boxes mean Acceptance met.
- If a finding turns out to be invalid in context, leave the box unchecked and add a `~~strikethrough~~` note explaining why.
- Several findings overlap with [`docs/TECH-DEBT.md`](TECH-DEBT.md) (the manual-import loop and the chat payload shape have correctness angles too). The cross-reference is noted on the Issue line; fix once, tick the box in both files.
- New findings discovered during fixes go at the bottom under "Discovered During Remediation".

---

## Strengths — What Already Works Well

Preserve these patterns when refactoring:

- The partial unique index `Trade_userId_ticker_open_unique` on `("userId", ticker) WHERE status='Open'` (`CLAUDE.md` "FIFO logic — invariants") makes the optimistic-concurrency retry in `process-executions.ts` cheap — no pessimistic lock, no global mutex, conflicts self-heal in one re-read.
- The research dashboard already memoises the expensive derivations: `filteredTrades`, `stats`, and `chartData` are all wrapped in `useMemo` with correct dependency lists (`components/research-dashboard.tsx:143`, `:146`, `:182`). The bottleneck is downstream of these memos, not in them.
- `processExecutions` performs the `brokerExecId` dedup against the per-user UNIQUE constraint with a single `maybeSingle()` round-trip per execution (`lib/ibkr/process-executions.ts:171-176`) — the right primitive; it just needs to fan out across tickers.
- `recomputeActualR` operates per-`tradeId` rather than scanning the whole user's `Trade` table, so the manual-import recompute pass scales with affected trades, not total trades.
- IBKR backfill uses `waitUntil()` from `@vercel/functions` (`CLAUDE.md` "Backfill / cron behavior") so the HTTP response returns 202 immediately and the long work continues asynchronously — exactly the right shape for a multi-minute job under Vercel's request envelope.
- The IBKR cron poll is bounded (4 attempts × 10s) and degrades gracefully via `IbkrTransientError` rather than hot-looping, so a slow Flex statement doesn't burn the function's 60s budget repeatedly.
- The Activity Flex query is end-of-day, so cron runs only 2×/day at 13:00 & 20:00 UTC (`CLAUDE.md` "Single Flex Query"). No over-polling — the sequential-by-user issue in P5 is the only thing standing in the way of this being a clean design.
- `parse-flex-xml.ts` resolves the PascalCase / camelCase Flex quirk in a single helper (`resolveStatement` + per-field `??` fallback) — keeps the parse-time cost flat at O(executions) with no double-walk.

---

## Findings

ID convention: `P##` numbered globally across phases. Where a finding was confirmed by reading the actual code path end-to-end (not just speculated), the `Issue` line says **"Confirmed."**

---

### Phase 1 — Critical (Day-1 blockers, must clear before next release)

#### [ ] P1. Chat "full" mode sends an unbounded JSON dump to Gemini on every message
- **Where:** `app/api/chat/route.ts:60-65`
- **Issue:** **Deferred 2026-06-19** — blocked on the product decision in Open Questions #1 (limit vs. server-side aggregation vs. tool-use / function-calling). Do not touch until the owner picks a direction. **Confirmed.** When the user switches the chat to "full" context mode, the route runs `supabase.from('Trade').select(...).eq('status','Closed')` with **no `.limit()`** and then `JSON.stringify(trades ?? [])` straight into the system prompt that is sent to Gemini 2.5 Pro on every message. For a power user with 2-3k closed trades this is a ~400-600 KB JSON blob shipped to Gemini per turn, plus the model is `gemini-2.5-pro` (the most expensive tier). Per-message latency, token cost, and eventual context-window exhaustion all scale linearly with trade count. The pattern also runs even when the user's question doesn't need raw rows ("what was my best month?" gets the same 600 KB dump as "summarise my last 5 trades"). Overlaps with [`docs/TECH-DEBT.md`](TECH-DEBT.md) on the "raw rows in prompt" architectural angle.
- **Acceptance:** Average outbound prompt size to Gemini in "full" mode is bounded — measured by logging `systemPrompt.length` during a soak test against the QA user dataset (`docs/qa-test-user.md`), the p95 across 20 successive messages stays under 64 KB regardless of total closed-trade count. Verified by populating the QA user to 1000 closed trades, hitting the chat 10×, and confirming both the logged size and a stable Gemini round-trip time.

#### [x] P2. Manual import runs sequential N+1 Supabase round-trips per leg
- **Where:** `app/api/trades/manual/route.ts:43-87`
- **Issue:** **Confirmed.** A single multi-leg submission (`/manual-import` Excel upload or batch form) runs **three sequential `for` loops**, each doing one Supabase round-trip per iteration: (1) lines 43-60 update Trade-level annotations per leg, awaited serially; (2) lines 65-80 do a `select brokerExecId` then a conditional `update source='manual'` per distinct tradeId, awaited serially; (3) lines 85-87 call `recomputeActualR` per tradeId, awaited serially. A 200-leg Excel import that touches 80 distinct trades = roughly 200 + 160 + 80 = ~440 sequential round-trips against Supabase before the route returns. Each round-trip is ~30-80ms from Vercel → Supabase, so the response is on the order of 15-30s — well inside the symptoms users complain about ("the import hangs"). Overlaps with [`docs/TECH-DEBT.md`](TECH-DEBT.md) — same loop has a correctness angle (no per-leg error surfaced if one update fails).
- **Acceptance:** End-to-end POST time for a 200-leg manual import against the QA user dataset, measured server-side from request entry to response, drops to under 25% of the current sequential baseline. Verified with the Excel template in `docs/qa-test-user.md` filled to 200 legs and run 5× consecutively — timings logged from `route.ts` entry / exit, before/after averages compared. Total Supabase round-trips for the route are O(distinct-trades), not O(legs) — counted by instrumenting a request-scoped counter in `createAdminClient` for the duration of the test.

#### [x] P3. Research dashboard rebroadcasts the entire filtered-trade array to chat context on every filter keystroke
- **Where:** `components/research-dashboard.tsx:148-167`
- **Issue:** **Confirmed.** The `useEffect` runs whenever `filteredTrades` or `stats` change — which is every keystroke in the filter bar — and calls `setContextData({...stats, trades: filteredTrades.map(t => ({...}))})`. The mapped array allocates a fresh 6-field object per trade on every keystroke. Because `ChatContext` is consumed by the chat sidebar mounted in the dashboard layout (`app/(dashboard)/layout.tsx` per `CLAUDE.md`), every consumer of `useChatContext()` re-renders on each state update. With 2000 filtered trades and the sidebar mounted, a single keystroke in the ticker filter input allocates ~2000 objects and re-renders the sidebar — input lag is observable above ~500 trades. The data isn't even used until the user actually opens the chat in "smart" mode and sends a message; it's broadcast eagerly for nothing.
- **Acceptance:** INP (Interaction to Next Paint) on a filter-bar text input, measured via Chrome DevTools Performance panel against a 2000-trade user, stays under 100ms p75 across a 5-character burst typed at normal speed. Verified by recording a profile of typing "AAPL" into the ticker filter and confirming no single keystroke generates a render of the chat sidebar.

---

### Phase 2 — Important (correctness & integrity)

#### [x] P4. `processExecutions` is fully sequential across executions
- **Where:** `lib/ibkr/process-executions.ts:150-158`
- **Issue:** **Confirmed.** The `for (const exec of executions)` loop awaits each `processOneExecution` in series. Each one is 1 dedup SELECT + 1 open-trade SELECT + 1-2 writes — so a 500-execution IBKR sync (a typical month for an active user, or any backfill) is ~1500+ sequential Supabase round-trips. Same-ticker executions must stay serial — that's the FIFO invariant in `CLAUDE.md` ("read → match → write cycle that retries on concurrency conflicts"), and the per-user partial unique index enforces it. But cross-ticker executions are independent: trade `AAPL` and trade `TSLA` for the same user touch disjoint rows. Grouping by ticker and processing groups in parallel (with a small concurrency cap, e.g. 5) cuts sync time by ~5× on typical multi-ticker datasets with no FIFO risk.
- **Acceptance:** End-to-end time for a 500-execution `processExecutions` call against the QA user, measured server-side, drops to under 40% of the current sequential baseline. Verified with a fixture of 500 executions spread across at least 20 tickers, run 3× to average. Per-ticker FIFO ordering is preserved — verified by the existing FIFO + concurrency integration tests passing unchanged after the change.

#### [x] P5. IBKR cron iterates over `BrokerConnection` rows sequentially
- **Where:** `app/api/cron/ibkr-sync/route.ts:152-155`
- **Issue:** **Confirmed.** The loop is documented as sequential because "IBKR rate-limits per-token" — but the rate limit is **per Flex token**, not global, so two different users' Flex calls are completely independent. With `maxDuration=60s` and a per-user sync taking 10-30s when IBKR is slow, ~3-4 sequential users already saturate the cron's budget; past that, later users in the list silently never get synced on this run and have to wait until the next scheduled 13:00 / 20:00 UTC tick. This becomes a real outage shape as soon as the userbase grows past the smallest handful of active connections.
- **Acceptance:** Total cron handler time for N active connections is bounded by the slowest individual sync plus a small overhead, not by the sum. Verified by mocking `syncOneConnection` to a 5s sleep and confirming a run with 8 fake connections completes in under 15s (rather than 40s). No regression in error isolation — when one user's IBKR token fails, other users still complete successfully (verified by mixing a throwing mock among the 8).

#### [x] P6. `ChatContext` value is a fresh object literal on every provider render
- **Where:** `lib/chat/chat-context.tsx:19-32`
- **Issue:** **Confirmed.** The `ChatContext.Provider` value is an inline object literal `{ isOpen, toggleChat: () => setIsOpen(p => !p), contextData, setContextData }` and the `toggleChat` arrow is allocated fresh on every render. Any state change inside the provider invalidates the context value reference, so **every** consumer of `useChatContext()` re-renders, even consumers that only read `isOpen` and have no interest in `contextData`. Compounds P3 — the broadcast in P3 invalidates the value, which then re-renders not just the sidebar but anything else reading the context. Two separate concerns are bundled into one context, but they have very different update frequencies (`isOpen` flips rarely, `contextData` mutates per keystroke).
- **Acceptance:** Reading `isOpen` alone does not re-render when only `contextData` changes. Verified by adding a counter component that subscribes only to `isOpen` (via a split context or an external store), typing into the research filter bar, and confirming the counter does not increment. `useMemo` / `useCallback` alone is not sufficient if the context shape stays unified — the test only passes if the two concerns are decoupled.

---

### Phase 3 — Polish (consistency / hygiene)

#### [x] P7. Research / trade-search charts and rows lack `React.memo`
- **Where:** `components/research/charts.tsx`, `components/trade-search.tsx:254-269`
- **Issue:** No top-level `memo()` wraps the chart components or the trade-search row renderer. Because `chartData` and `pageItems` are derived inside the parent via `useMemo`, the parent re-renders on every filter change and recharts rebuilds its internal SVG even when the underlying `data` array is referentially stable. At current scale (1-2k trades) this is bearable but visibly stutters during fast typing in the filter bar. The fix is small but only worth doing once P3 and P6 are resolved — otherwise the parent re-renders too often for memoisation to matter.
- **Acceptance:** With P3 and P6 fixed, each chart component is wrapped in `memo()` with a referentially stable props contract from the dashboard, and a React DevTools profile during a 5-character keystroke burst on the ticker filter shows each chart re-rendering at most once per committed filter state (not once per keystroke).

#### [ ] P8. `parse-flex-xml.ts` persists the entire raw XML node into `Order.rawPayload`
- **Where:** `lib/ibkr/parse-flex-xml.ts:134`
- **Issue:** **Deferred 2026-06-19** — blocked on Open Question #3 (is anything downstream reading the full payload? owner decision needed before shrinking or replacing the column). Do not touch until resolved. **Confirmed.** `rawPayload: node` stores the full unprocessed XML node as JSONB on every `Order` row. Over a year of cron syncs this inflates the `Order` table substantially — and any later `select *` on `Order` (the manual-import recompute path does one indirectly via `recomputeActualR`) drags the whole blob over the wire. Not a hot-path latency hit today, but quietly bloats both storage and downstream query payloads.
- **Acceptance:** Average `Order.rawPayload` size measured across the production dataset drops to under 1 KB per row (or the column is replaced by a narrow set of explicit columns for the fields actually read downstream — `_manualOrderTime`, `netCash`, `commissionCurrency`, `orderTime`, `ibCommissionCurrency`). Verified by running `select avg(octet_length(rawPayload::text)) from "Order"` on a representative slice.

#### [ ] P9. Research calculations iterate the trade list 3-5 times per render
- **Where:** `lib/utils/calculations.ts`, `lib/utils/research-charts.ts`
- **Issue:** **Deferred by owner 2026-06-19** — no perf need at current scale; revisit if a user's dataset reaches ~20k trades or the `chartData` memo profiles above ~30ms. Do not touch until then. `equityCurve`, `calcStats`, `setupPerformance`, `pnlByTicker`, `pnlByDayOfWeek`, `pnlByHour`, `holdTimeVsR` each do their own `.filter().reduce()` / `.map()` passes over the same array. Negligible for the current scale (1-2k trades after the `useMemo` upstream); becomes visible above ~20k trades. Low priority — only worth doing if a user accumulates years of data and the dashboard starts feeling slow.
- **Acceptance:** Total time spent in the `chartData` `useMemo` on a 20k-trade synthetic dataset, measured via the React DevTools Profiler "Ranked" view, is under 50ms p95. Either by collapsing the multiple passes into a single walk, or by precomputing the per-trade derivations once and reading them from the chart helpers.

#### [ ] P10. `BrokerEvent` audit log grows by ~10 KB per IBKR sync
- **Where:** `app/api/cron/ibkr-sync/route.ts` (per `CLAUDE.md` — `xml.slice(0, 10000)` per row)
- **Issue:** **Deferred 2026-06-19** — deferred pending owner review; retention policy needs a product/ops call before implementing. Do not touch until resolved. Every cron run writes an `xml.slice(0, 10000)` audit blob into `BrokerEvent` per connection. At 2 cron runs × 365 days × N users this becomes a meaningful row of storage growth — not a query-latency issue today (the audit table isn't selected from in hot paths), but it will eventually become an operational concern. Pure hygiene.
- **Acceptance:** A retention policy is in place — either a Supabase cron / scheduled job that deletes `BrokerEvent` rows older than a documented retention window, or the audit blob is truncated to a smaller fingerprint (e.g. first 1 KB + a hash) sufficient for the audit use case. Documented in `CLAUDE.md` under "Backfill / cron behavior". Verified by running the cleanup job once on staging and confirming the row count drops as expected.

---

## Open Questions / Items Requiring Owner Input

Items that surfaced during the audit but need a product, security, or business decision before they can become actionable findings. Owner responses recorded inline as they land.

- **[Open] Chat "full" mode — what's the right product shape?** P1 forces a choice: do we (a) cap to the last N trades regardless of query, (b) pre-aggregate per-ticker / per-setup rollups server-side and only send raw rows when the question demands them, or (c) move to a tool-use / function-calling shape where Gemini requests specific slices? Each has different latency, cost, and answer-quality trade-offs. **Status 2026-06-19:** owner has not yet decided; P1 is marked Deferred until this resolves.
- **[Answered 2026-06-19] User-count target for the next 12 months: ~100 active users.** This tightens the case for P4 (cross-ticker FIFO parallelism) — at 100 users each running 1-2 IBKR syncs a day, and backfills for new signups pulling 12 months of executions at once, cross-ticker parallelism is no longer optional. P5 (cross-user cron parallelism) becomes a hard blocker for cron staying inside its 60s envelope. Both stay in Phase 2 (the phase is about correctness of the fix, not raw priority bump).
- **[Open] Is the `Order.rawPayload` JSONB column actually needed for any downstream consumer?** P8 prescribes either shrinking or replacing it, but if there's an in-flight or planned consumer (audit, reconciliation, future re-parse with an updated Flex parser) that needs the full payload, the trade-off shifts. **Status 2026-06-19:** owner has not yet decided; P8 is marked Deferred until this resolves.
- **[Open] Retention / hygiene policy for `BrokerEvent`.** P10 needs a call on either (a) a retention window (e.g. delete rows older than 90 days) or (b) a smaller audit fingerprint per row. **Status 2026-06-19:** owner has not yet decided; P10 is marked Deferred until this resolves.
- **[Resolved 2026-06-19] Manual-import latency budget — no fixed SLO.** The P2 Acceptance clause targets a *relative* improvement (drop to under 25% of the current sequential baseline) rather than a wall-clock number. Rationale: absolute time correlates with input size; the audit's job is to prove the fix removed the N+1 pattern, not to commit to a product-facing latency contract.

---

## Discovered During Remediation

> Add new findings here as they surface while working through the plan. Same format: `[ ] P##. Title` + Where / Issue / Acceptance.
