# Trade Analyst — Tech Debt Audit & Remediation Plan

> **Audit date:** 2026-06-10
> **Auditor:** Claude (engineering:tech-debt skill)
> **App version reviewed:** `main` branch at commit `973ae54` + production at https://trade-analyst-lyart.vercel.app

---

## Background

Trade Analyst is a Hebrew-RTL trading journal for self-directed equity traders, built on Next.js 14 (App Router) + Supabase Postgres with RLS. It pulls trade executions from IBKR's Flex Web Service, normalises them through a FIFO matching pipeline, and serves a research dashboard plus an AI chat assistant ("חנן", Gemini-backed). The project has shipped eight phases (auth, FIFO, IBKR sync, price sync, dashboard, research, AI chat, search + manual entry) and is deployed single-user today but architected multi-user at the DB layer per the invariant in `CLAUDE.md`.

**Scope:** Code, architecture, dependency, test, documentation, and infrastructure debt across the application surface — `app/`, `lib/`, `components/`, `__tests__/`, `scripts/`, `docs/`, `.github/workflows/`, and root config. Out of scope: UI/UX polish — see companion [`docs/UI-AUDIT.md`](UI-AUDIT.md). Feature gaps in the trading domain itself (those belong in product backlog), and the parked dashboard / Massive price-sync code unless it overlaps with a current debt item.

**Stack reviewed:** Next.js 14.2.29 · React 18.3 · TypeScript 5.8 · Tailwind 3 · Supabase JS 2.104 · `@supabase/ssr` 0.6.1 · `@google/genai` 2.5 · `recharts` 2.15 · `xlsx` 0.18.5 · `fast-xml-parser` 4.5 · Vitest 3.1 · ESLint 8.57 · Vercel hosting · GitHub Actions cron.

**Methodology:**
1. Full read of `CLAUDE.md`, `package.json`, `middleware.ts`, `tsconfig.json`, `vercel.json`, `vitest.config.ts`, `next.config.mjs`, `.gitignore`, and `.github/workflows/ibkr-sync.yml`.
2. Directory walk of `app/`, `lib/`, `components/`, `__tests__/`, `scripts/`, `docs/`, `dist/` to map structure and identify deletions / renames left half-done by prior refactors.
3. End-to-end source read of the trading-correctness path: `lib/trade/fifo.ts`, `lib/ibkr/process-executions.ts`, `lib/trade/manual-entry.ts`, `lib/trade/recompute-actual-r.ts`, and all four close/manual entry route handlers (`app/api/trades/[id]/route.ts`, `…/[id]/close/route.ts`, `…/manual/route.ts`, `…/manual/closed/route.ts`).
4. End-to-end source read of the Supabase client layer (`lib/supabase/server.ts`, `client.ts`, `admin.ts`), the cron handlers (`app/api/cron/ibkr-sync/route.ts`, `…/massive-prices/route.ts`), the profile API (`app/api/profile/route.ts`), and the dashboard layout (`app/(dashboard)/layout.tsx`).
5. Grep sweeps for `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `as any`, `TODO|FIXME|HACK|XXX`, `new URL(request.url).origin`, `getBaseUrl|SITE_URL` to quantify type-system escape hatches and confirm adherence to documented invariants.
6. `npm outdated --json` and `npm audit` to enumerate dependency drift and active CVE exposure; cross-referenced critical/high advisories against actual call sites.
7. Cross-referenced every finding against `CLAUDE.md` invariants (multi-user RLS, FIFO concurrency rules, IBKR date parsing, `getBaseUrl` rule, partial unique index on open trades) and against the QA baseline in `docs/qa-test-user.md`.
8. Each finding scored internally with `Priority = (Impact + Risk) × (6 − Effort)`, all on a 1-5 scale, to order within phases.

**Reference frameworks:**
- Project-internal invariants documented in `CLAUDE.md` (single source of truth for multi-user, FIFO, RLS, and IBKR conventions)
- OWASP Top 10 — A05 (Security Misconfiguration), A06 (Vulnerable & Outdated Components), A08 (Software & Data Integrity)
- 12-Factor App — III (Config), V (Build, release, run), XI (Logs)
- GitHub Advisory Database / `npm audit` for dependency exposure
- Vitest + React Testing Library coverage conventions
- Next.js 14 App Router conventions for server/client component boundaries and route handler patterns

---

## How to Use This Plan

- Each finding is **outcome-driven**: it states what is wrong and what "fixed" looks like, but **not** how to implement it. The implementer chooses the approach.
- Work top-down by phase. **Do not skip Phase 1.** Phase 1 contains active exposure that affects production today.
- Tick the box only when the **Acceptance** clause is satisfied — not when the change is merely written.
- When an item lands, flip `[ ]` → `[x]` on the heading line. Empty boxes mean unfinished; ticked boxes mean Acceptance met. This lets anyone (or any future session) skim the file and trust the state without re-deriving what shipped.
- If a finding turns out to be invalid in context, leave the box unchecked and add a `~~strikethrough~~` note explaining why.
- If a finding is deferred for an external reason (blocked decision, dependency gap), leave the box unchecked and prepend a `**Deferred {YYYY-MM-DD}** — {reason}` clause to the Issue line so the deferral is discoverable from the heading.
- New findings discovered during fixes go at the bottom under "Discovered During Remediation".
- Several Phase 3 items (T13 Massive, T14 dashboard) are gated on Open Questions at the end of this doc. Resolve those first or those items cannot move.

---

## Strengths — What Already Works Well

Preserve these patterns when refactoring:

- **Pure FIFO core.** `lib/trade/fifo.ts` is a side-effect-free function returning a `FifoAction` discriminated union. The 381-line `__tests__/fifo.test.ts` exercises OPEN / SCALE_IN / REDUCE / CLOSE / REVERSAL plus the `MIN_RISK_PER_SHARE = 0.0001` guard that prevents Infinity/NaN `actualR`. Keep persistence concerns out of this module.
- **Three-layer concurrency model.** `process-executions.ts` defends the FIFO read→match→write cycle with (a) a partial unique index `Trade_userId_ticker_open_unique`, (b) optimistic UPDATE guards (`.eq('status','Open').eq('totalQuantity', readValue)`), and (c) atomic REVERSAL via the `reverse_position` Postgres RPC with its own quantity-match guard. The 4-attempt retry loop only fires on `ConflictError`, never on real errors.
- **IBKR date parsing.** `lib/ibkr/parse-date.ts` manually decomposes `dd/MM/yyyy;HH:mm:ss TZ` and rebuilds via `Date.UTC()` to avoid the `date-fns` local-timezone trap. `__tests__/parse-date.test.ts` covers EST/EDT/CST/CDT/PST/PDT plus DST transitions.
- **Dual-root XML resilience.** `lib/ibkr/parse-flex-xml.ts` handles both real Activity XML (camelCase fields, `FlexQueryResponse` root) and older fixtures (PascalCase) via `resolveStatement()` + `PascalCase ?? camelCase` field fallbacks.
- **RLS as the default.** Every app table has a `userId` FK + `auth.uid() = "userId"` policy. Only `lib/supabase/admin.ts` (service-role) bypasses RLS, and that's restricted to cron + seed. Request paths use the cookie-bound `lib/supabase/server.ts` client.
- **`getBaseUrl()` discipline.** `lib/utils.ts` centralises external-URL construction. The single call site (`app/auth/callback/route.ts`) uses it correctly; a grep confirms **zero** occurrences of `new URL(request.url).origin` anywhere in the repo. The open-redirect guard requirement is documented in `CLAUDE.md`.
- **Encrypted broker tokens.** `flexTokenEncrypted` is AES-256-GCM at rest via `lib/ibkr/encrypt.ts` and never returned in API responses.
- **Transient-vs-fatal cron handling.** `app/api/cron/ibkr-sync/route.ts` distinguishes `IbkrTransientError` from fatal errors and skips updating `lastSyncAt` on transient, so the next cron run retries without waiting the full polling interval. Mirrored in the UI by `IBKR_TRANSIENT_CODES` in `components/sync-indicator.tsx` with a documented warning to keep the two sets in sync.
- **Manual-entry bypass without schema growth.** The `_manualOrderTime` ISO-string-on-`rawPayload` pattern in `lib/trade/manual-entry.ts` lets manual entries skip IBKR date parsing without adding columns to `Order`. `buildOrderInsert` detects the key.
- **Honest error handling at the per-execution boundary.** `processOneExecution` retries only on `ConflictError`; genuine DB errors fail immediately and are never swallowed. Matches the "no defensive try/catch that masks environment issues" rule in the user's global CLAUDE.md.

---

## Findings

ID convention: `T##` numbered globally across phases. Where a finding was confirmed by reading the deployed response, running the code path, or observing a tool output, the Issue line says **"Confirmed."**

---

### Phase 1 — Critical (Day-1 blockers, must clear before next release)

#### [x] T1. `xlsx` 0.18.5 ships with unpatched Prototype Pollution + ReDoS, used on a user-upload route
- **Where:** `package.json:31` declares `"xlsx": "^0.18.5"`. Consumed by `lib/trade/excel-import.ts`, which is reached from the user-facing Excel-import flow in `app/(dashboard)/manual-import/page.tsx` via `components/trade-excel-import.tsx`.
- **Issue:** **Confirmed.** `npm audit` reports `xlsx` against GHSA-4r6h-8v6p-xvw6 (Prototype Pollution, high) and GHSA-5pgg-2g8v-p4x9 (ReDoS, high) with "No fix available" — there is no in-line upgrade path. A malicious or malformed `.xlsx` upload can corrupt `Object.prototype` or stall the server on a crafted string. The route accepts user-uploaded files, so the exposure is real, not theoretical.
- **Acceptance:** `npm audit` no longer reports an `xlsx` advisory. Either the dependency is replaced with an alternative parser that handles the existing `lib/trade/excel-import.ts` test cases unchanged (`npm run test:run -- __tests__/excel-import.test.ts` passes), or the import flow is removed and the route returns 410 Gone. Verified by `npm audit | grep -c xlsx` returning 0 and by uploading the documented template via the live UI and getting the same `processed/skipped/failed` JSON as today.

---

### Phase 2 — Important (correctness & integrity)

#### [x] T2. IBKR cron loads a single `BrokerConnection` per run — silently drops every user beyond the first
- **Where:** `app/api/cron/ibkr-sync/route.ts:20-24` and `app/api/cron/massive-prices/route.ts:15-19` — both call `.eq("isActive", true).maybeSingle()`.
- **Issue:** **Confirmed.** Reading the cron handlers shows a single-row `.maybeSingle()` filter. The moment a second user connects IBKR, `maybeSingle()` returns the first row Postgres happens to give back; the rest are never synced and their `lastSyncAt` is never updated. This directly contradicts the multi-user invariant in `CLAUDE.md` ("Multi-user SaaS — public signup via `/signup`. Architecture is multi-user at the DB level"). Today the production environment has one user, so the bug is dormant — but it must clear before any growth event (second QA tester, beta signup, public launch).
- **Acceptance:** The cron handler iterates every active `BrokerConnection`, processes each independently (one failed connection does not block the others), and updates each connection's `lastSyncAt` / `lastSyncStatus` / `lastSyncError` individually. Verified by seeding two active connections for two distinct users in a test environment, triggering the cron once, and confirming both `BrokerConnection` rows have updated timestamps and both users' `Order` rows have the corresponding `brokerExecId` entries.

#### [x] T3. `app/api/profile/route.ts` rolls its own Supabase client instead of using `lib/supabase/server.ts`
- **Where:** `app/api/profile/route.ts:7-14` defines a local `createAnonClient()` that calls `createServerClient` with `{ cookies: { getAll: () => cookieStore.getAll() } }` — no `setAll` handler. `cookies()` is also invoked without `await`, diverging from `lib/supabase/server.ts:7`.
- **Issue:** **Confirmed.** Two problems in one. (a) The hand-rolled client omits the cookie-write path that `lib/supabase/server.ts` provides, so any auth-token refresh during the request goes unwritten — the user can hit a needlessly-stale session. (b) The handler then switches to `createAdminClient()` to update / read the user's own row, bypassing RLS for an operation that RLS already permits (`auth.uid() = "id"` on `User`). Service-role usage should be restricted to cron + seed per `CLAUDE.md`.
- **Acceptance:** `profile/route.ts` imports and uses `createClient` from `@/lib/supabase/server` for all reads and writes against the `User` row. `createAdminClient()` is not imported anywhere in this file. Verified by `grep -n "createAdminClient\|createAnonClient" app/api/profile/route.ts` returning empty, and by exercising GET and PATCH against the live route while signed in as a non-admin user and getting 200 on own-row operations + 403/empty on attempts at someone else's row.

#### [x] T4. `@supabase/ssr` pinned at 0.6.1 forces 14 `as any` shims across route handlers
- **Where:** `package.json:18` (`"@supabase/ssr": "^0.6.1"`, latest 0.12.0). Shim sites: `lib/supabase/server.ts:31` (cast on return), plus `as any` + `eslint-disable-next-line @typescript-eslint/no-explicit-any` pairs at `lib/ibkr/process-executions.ts:161,165,262`, `lib/trade/recompute-actual-r.ts:30,51`, `app/api/trades/[id]/route.ts:45`, `app/api/trades/[id]/close/route.ts:125`, `app/api/trades/manual/route.ts:55,75`, `app/api/trades/manual/closed/route.ts:120`, `app/api/profile/route.ts:86`.
- **Issue:** **Confirmed by grep.** Eleven `eslint-disable @typescript-eslint/no-explicit-any` comments and the cast in `server.ts` exist for one reason: `createServerClient<Database>` in 0.6.x does not propagate the `Database` generic to `from()`/`upsert()`, so TS narrows `values` to `never`. The fix landed upstream. Until the upgrade happens, every new route handler that writes through the user-bound client has to copy the same `as any` pattern, and TypeScript can't catch column-name typos in updates.
- **Acceptance:** `@supabase/ssr` upgraded to a version where `createServerClient<Database>` propagates the generic through to `.from('Trade').update({…})` such that the cast in `lib/supabase/server.ts:31` is no longer required. After the upgrade, the shim cast and all `eslint-disable @typescript-eslint/no-explicit-any` lines listed above are removed in the same change, `npm run build` passes, and `npm run test:run` is green. Verified by `git diff` showing net negative lines on `eslint-disable` count and by `grep -c "as any" app/api/trades` returning 0.

#### [x] T5. Manual-close routes have no test coverage
- **Where:** `app/api/trades/[id]/close/route.ts` (138 lines, including FIFO close + Trade-annotation update) and `app/api/trades/manual/closed/route.ts` (141 lines). Neither is referenced from any file in `__tests__/`.
- **Issue:** **Confirmed by grep.** These are the newest entry points into the FIFO pipeline, accepting user-supplied price / date / commission / `closeReason` and calling `processExecutions` to write Trade and Order rows. A silent regression here corrupts FIFO state and breaks the QA baseline documented in `docs/qa-test-user.md`. Today, the only safety net is manual QA against the test user.
- **Acceptance:** A vitest file exercises both routes with: (a) a happy-path close that produces a Closed Trade row with correct `actualR`, `result`, and `closeReason`; (b) each validation failure path (`closePrice ≤ 0`, malformed date, unknown `closeReason`, `original_stop` without `stopPrice`, `target` without `targetPrice`, `modified_stop` without `modifiedStopPrice`); (c) attempting to close an IBKR-source trade via the manual-close endpoint and getting 403; (d) attempting to close an already-Closed trade and getting 409. Verified by `npm run test:run -- close` reporting all cases green and by the new file appearing in the test list.

#### [x] T6. Duplicate close-validation block between two route handlers
- **Where:** `app/api/trades/[id]/close/route.ts:36-80` and `app/api/trades/manual/closed/route.ts:42-62`. Both blocks re-check `closePrice > 0`, the `YYYY-MM-DD` and `HH:MM` regexes, the `CLOSE_REASON_KEYS` whitelist, the `original_stop` / `target` / `modified_stop` guards, and the `סטופ שונה: {price}` notes-append clause. Roughly 45 lines of byte-identical or near-identical logic.
- **Issue:** Bug-fixes and rule changes have to happen in both files in lockstep. A new `closeReason` value requires editing two places; missing one produces an asymmetric API where the same reason works on one route and 422s on the other. The duplicated `notes` append uses the same Hebrew string in both files, with no shared constant.
- **Acceptance:** A single `validateClosePayload(payload, trade)` helper (or equivalent) lives under `lib/trade/` and is imported by both route handlers. Both routes use it as their only validation source. Verified by reading both handlers and finding zero re-implementation of the regex / whitelist / cross-field guards, and by the `__tests__` from T5 passing unchanged after the refactor.

#### [x] T7. No integration test for the `reverse_position` concurrency guard
- **Where:** `lib/ibkr/process-executions.ts:191-235` (the retry loop), `:382-405` (the REVERSAL RPC call), and the partial unique index `Trade_userId_ticker_open_unique` + RPC guard documented in `CLAUDE.md`. `__tests__/integration/fifo-to-db.test.ts` exists (163 lines) but does not exercise the concurrency paths.
- **Issue:** The `MAX_PERSIST_ATTEMPTS = 4` retry loop, the `ConflictError` distinction from real errors, and the RPC's `reverse_position_conflict` raise are described in `CLAUDE.md` as load-bearing for multi-user correctness. None of this is exercised in CI. A future refactor (including the T4 Supabase upgrade) could silently break the conflict-retry contract without any test failing.
- **Acceptance:** A vitest integration test (against a real or in-memory Postgres with the same partial unique index applied) covers: (a) two concurrent OPEN executions for the same `(userId, ticker)` produce one OPEN + one SCALE_IN (the second retry path), not two open Trade rows; (b) a REVERSAL whose `close` UPDATE races against a concurrent SCALE_IN is retried and either succeeds against fresh state or surfaces as a FAILED execution after 4 attempts — never as silent data corruption. Verified by `npm run test:run -- concurrency` (or equivalent) being green and by reading the test file to confirm both scenarios above are present.

#### [ ] T8. ESLint / build-toolchain CVE chain is auto-fixable but unfixed
- **Where:** `package.json` devDependencies — `eslint-config-next: 14.2.29`, `@next/eslint-plugin-next` (transitive), `glob` (transitive via `brace-expansion`).
- **Issue:** **Confirmed by `npm audit`.** Total: 1 critical + 5 high + 4 moderate. Excluding the production `xlsx` advisories (covered in T1), the remainder are dev-only chains routed through `eslint-config-next` and `glob`. Exposure is mainly to developer machines and CI, not the deployed runtime — but the count is reported externally by anyone running `npm audit` against the repo, including security scanners on the hosting provider side. ~~**Partial 2026-06-10** — `npm audit fix` ran against the non-breaking subset, dropping the count from 10 to 8 and removing the `xlsx` critical via T1's swap. `next` bumped within 14.x to 14.2.35 (latest 14). What remains: 4 `next` advisories that require Next 15+ (major migration outside T8's auto-fix scope), 1 `fast-xml-parser` XMLBuilder advisory (not exploitable — we only use `XMLParser`), 1 transitive `uuid` advisory via `exceljs` (only the `buf` argument path is vulnerable; exceljs doesn't pass it). `npm audit --omit=dev` now reports 5 vulnerabilities (4 moderate + 1 high), down from 10 with one production-real critical. The remaining items belong in a separate Next 15 migration finding.~~

#### [x] T17. Next 14.x carries seven unfixed production CVEs that only resolve in Next 15+
- **Where:** `package.json:25` (`"next": "14.2.29"` at audit time; bumped to `14.2.35` under T8 but still on the 14.x branch). Advisories:
  - GHSA-3h52-269p-cp9r — Information exposure in dev server origin verification (dev-only)
  - GHSA-g5qg-72qw-gw5v — Cache Key Confusion for Image Optimization API Routes
  - GHSA-4342-x723-ch2f — Improper Middleware Redirect Handling Leads to SSRF
  - GHSA-xv57-4mr9-wg8v — Content Injection for Image Optimization
  - GHSA-mwv6-3258-q52c — Denial of Service with Server Components
  - GHSA-5j59-xgg2-r9c4 — DoS with Server Components Incomplete Fix Follow-Up
  - GHSA-9g9p-9gw9-jx7f — DoS via Image Optimizer `remotePatterns` configuration
- **Issue:** **Confirmed by `npm audit --omit=dev`** (5 vulns / 4 moderate + 1 high remaining after T8). All seven advisories are patched only from Next 15 onwards; the 14.x branch will not receive backports. Real exposure in our app:
  - **Server Components DoS** — every page is server-rendered (App Router), so the DoS surface is full-cover.
  - **Image Optimization** advisories — exposure exists if `next.config.mjs` ever adds `images.remotePatterns` (it currently doesn't; a future addition activates the CVE).
  - **Middleware SSRF** — our `middleware.ts` does redirect-to-login but never echoes user-supplied destination, so today's surface is low. The CVE is in the framework itself, not our code.
  Splitting out from T8 because the work is not "auto-fixable" — it's a major-version migration with breaking changes across App Router behaviour, `cookies()` / `headers()` semantics, possibly React 19, and a Tailwind alignment pass.
- **Acceptance:** `npm audit --omit=dev` reports zero `next` advisories. `next` is on a major version that has received the seven advisories above as patches (Next 15.x or later). The app builds, all 234 tests pass, the dashboard / research / manual-import / profile / signup flows still render and accept input in the browser (verified by a manual walkthrough), and the IBKR sync cron still returns 200 on a real run. Migration notes captured in a new `docs/next15-migration.md` so the change can be reviewed without re-deriving the diff. Verified by `npm audit --omit=dev | grep -c "node_modules/next"` returning 0.

#### [ ] T9. Cron failure has no out-of-band observability
- **Where:** `.github/workflows/ibkr-sync.yml` (single workflow file) + `components/sync-indicator.tsx` (in-app indicator polling `/api/ibkr/connection` every 60s).
- **Issue:** If the GitHub Actions workflow itself fails (token mis-configured, runner outage, `CRON_SECRET` rotated), the in-app indicator stays whatever colour the last successful sync left it. There is no email, no Slack, no Vercel webhook — silent failures land on the next user complaint. For an end-of-day journal that's tolerable a day or two; for the multi-user case behind T2 it scales badly.
- **Acceptance:** A cron failure surfaces outside the application within one workflow run. Acceptable shapes: a GitHub Actions `on: workflow_run` notifier that pings a webhook on `conclusion != success`, a Vercel monitor on the cron endpoint, or a separate workflow that reads `/api/ibkr/connection` and alerts when `lastSyncAt` is older than 24h. Verified by deliberately invalidating `CRON_SECRET` in a staging environment, running the workflow once, and receiving the alert in the chosen channel.

---

### Phase 3 — Polish (consistency / hygiene)

#### [x] T10. `CLAUDE.md` Phase History table links to handoff documents that do not exist
- **Where:** `CLAUDE.md:144-153` (Phase History table) — links `docs/phase-1-handoff.md` through `docs/phase-8-handoff.md`. `docs/` contains only `qa-test-user.md` and this audit doc.
- **Issue:** **Confirmed by `ls docs/`.** A new contributor (or a future Claude session) following the table will hit eight 404s on the canonical onboarding path. The table claims to be "reference material only" but it is the only narrative of how the project got here.
- **Acceptance:** Either the eight referenced files exist with the documented per-phase content, or the table is replaced with a single line acknowledging that phase logs live in git history (e.g., "Phase logs are in git history; see `git log --grep='Phase'` for context"). Verified by every link in the section either resolving to a file with body content or being removed.

#### [x] T11. `components/research-dashboard.tsx` has grown to 1237 lines in a single file
- **Where:** `components/research-dashboard.tsx` (1237 lines). Holds chart components (LineChart, BarChart, ScatterChart variants), filter state, metric cards, layout shell, and tooltip wiring all in one client component.
- **Issue:** The file is the largest non-page artefact in the repo by a factor of ~2. Any iteration on a single chart loads the whole file into editor context; reviewers reading a PR have to scroll past unrelated chart code. The internal coupling is shallow — chart components are independent and could ship as separate `.tsx` files behind one re-export.
- **Acceptance:** `components/research-dashboard.tsx` (or its replacement entry point) is ≤ 400 lines and re-exports / composes chart blocks from sibling files in `components/research/` (or equivalent). Each chart block lives in its own file ≤ 250 lines. Verified by `wc -l components/research-dashboard.tsx components/research/*.tsx` and by `npm run test:run -- research-charts` still being green.

#### [ ] T12. Middleware and DashboardLayout both query `User.firstName` on every authenticated request
- **Where:** `middleware.ts:48-58` (signup-redirect guard) and `app/(dashboard)/layout.tsx:34-42` (post-Google-signin funnel) both run `supabase.from('User').select('firstName').eq('id', user.id).maybeSingle()`.
- **Issue:** **Confirmed by reading both files.** Two round-trips per authenticated request where one would do. Not user-visible at single-user scale, but the duplication will compound under the multi-user load implied by T2 — and it's the kind of "looks correct, runs twice" pattern that future refactors copy. ~~**Invalid in context 2026-06-10** — re-reading both files shows the checks are *mutually exclusive*, not duplicate: middleware only queries `firstName` when `pathname` matches `/signup` (line 48: `if (user && isSignupPage)`), while the layout only runs for paths inside the `(dashboard)` group (`/research`, `/search`, `/manual-import`, `/profile`, `/settings`, `/dashboard`). No request fires both. The two are complementary guards — middleware blocks returning visitors from re-entering `/signup`; layout funnels half-onboarded visitors into `/signup`. The original "two round-trips per request" claim was wrong. **Separate optimisation landed**: the layout used to always run `select firstName` + `upsert` (two trips) on every dashboard page; it now reads first and only inserts when the row genuinely doesn't exist. Saves one trip per page on returning users.~~

#### [ ] T13. Parked Massive price-sync code ships dormant
- **Where:** `lib/massive/client.ts` (56 LOC), `lib/massive/sync.ts` (59 LOC), `app/api/cron/massive-prices/route.ts` (68 LOC), `app/api/massive/refresh/route.ts` (46 LOC), `app/api/massive/settings/route.ts` (43 LOC). Total ≈ 272 LOC. Plus references from `components/open-positions-dashboard.tsx:93` (the `fetch('/api/massive/refresh', …)` call) and `components/sync-indicator.tsx:89-95` (commented-out `DASHBOARD-FUTURE` block).
- **Issue:** **Deferred 2026-06-10** — owner intends to re-enable the price sync in a future round; the code is kept on purpose. Risk audit: no GitHub Actions workflow targets the cron endpoint, `MASSIVE_API_KEY` is not set in production, and the only UI caller (`open-positions-dashboard.tsx`) was removed in T14. With those three preconditions, the parked code cannot burn credits or fire in the wild. To make the parked state explicit (not "we forgot"), a `PARKED — see TECH-DEBT.md T13` header comment was added to every `lib/massive/`, `app/api/massive/`, and `app/api/cron/massive-prices/` file. Original Issue text follows: `CLAUDE.md` documents the price sync as "currently disabled" and notes the GitHub Actions workflow was never added. The TypeScript still compiles, the routes still respond, and the cron endpoint will accept a `CRON_SECRET`-authenticated call and burn Massive API credits. The half-disabled state means a future Claude session can re-enable the sync by accident.
- **Acceptance:** Depending on Open Question 1: (a) if the sync is coming back, the missing GitHub Actions workflow exists, `MASSIVE_API_KEY` is documented as required in `.env.example`, the sync-indicator dot is re-enabled, and the user-facing settings panel is shown; or (b) if it is not coming back, `lib/massive/`, `app/api/massive/`, `app/api/cron/massive-prices/`, the `DASHBOARD-FUTURE` comment blocks in `sync-indicator.tsx`, and the `/api/massive/refresh` calls in `open-positions-dashboard.tsx` are deleted, and `CLAUDE.md` no longer references Massive as a parked feature. Verified by either `git ls-files lib/massive` returning paths and a successful workflow run logging an update, or by `git ls-files | grep -c massive` returning 0.

#### [x] T14. `/dashboard` route and `open-positions-dashboard.tsx` ship behind a redirect
- **Where:** `app/(dashboard)/dashboard/page.tsx` (29 LOC server component), `components/open-positions-dashboard.tsx` (369 LOC client component). Redirects from `/dashboard` to `/research` are in `app/page.tsx`, `middleware.ts`, the login page, and the auth callback per `CLAUDE.md`.
- **Issue:** The component and page still compile into the production bundle; the dashboard is reachable by any internal `<Link href="/dashboard">` (which the middleware would now redirect — but the code is still alive in the tree). `CLAUDE.md` says "the dashboard component code is kept, not deleted" deliberately, but the parked state is indistinguishable from "we forgot". Gated on Open Question 2.
- **Acceptance:** Depending on Open Question 2: (a) if the live dashboard is coming back, the redirect chain is removed and `/dashboard` is reachable, with a smoke test asserting it renders open positions; or (b) if it is not coming back, `app/(dashboard)/dashboard/`, `components/open-positions-dashboard.tsx`, and the four redirect call sites are removed. Verified by either reaching `/dashboard` and seeing positions, or by `git ls-files | grep -ci open-positions-dashboard` returning 0.

#### [x] T15. `__tests__/polygon-client.test.ts` references the pre-rename module name
- **Where:** `__tests__/polygon-client.test.ts:2` imports from `@/lib/massive/client`.
- **Issue:** **Confirmed.** The file tests `lib/massive/client.ts` but its name still says polygon, left over from the Polygon → Massive rename documented in `CLAUDE.md`. Cosmetic, but misleading to anyone scanning the test directory.
- **Acceptance:** The test file is renamed to `__tests__/massive-client.test.ts` (or removed entirely if T13 chooses option (b)). Verified by `ls __tests__/ | grep polygon` returning empty and `npm run test:run` still green.

#### [x] T16. Pre-Next.js Vite build artefacts sit at `dist/`
- **Where:** `dist/index.html`, `dist/assets/index-DUe5cJxi.js`, `dist/assets/index-De8F1fso.css`.
- **Issue:** **Confirmed.** `dist/` is the Vite output directory from the pre-Next.js bootstrap (the HTML still has `<div id="root">` and a Vite-style hashed asset reference). Next.js builds to `.next/`. `.gitignore:9` excludes `dist/`, so it is not tracked, but the directory exists on disk and will confuse anyone running a fresh `find . -name index.html`. Trivial cleanup.
- **Acceptance:** `dist/` is removed from the working tree (since it is `.gitignore`d, removal is local-only and not a commit). Verified by `test -d dist && echo present || echo gone` printing `gone`.

---

## Open Questions / Items Requiring Owner Input

Items that surfaced during the audit but need a product or owner decision before they can become actionable findings.

- ~~**1. Is the Massive (formerly Polygon) price sync coming back, and when?**~~ **Answered 2026-06-10** — owner plans to use it in a future round; the parked code stays. T13 marked Deferred with the rationale and a risk audit (no workflow, no API key, no UI caller). All Massive files received a `PARKED — see TECH-DEBT.md T13` header comment so a future Claude session reads the intent instead of guessing.
- ~~**2. Is the live `/dashboard` (open positions) view coming back?**~~ **Answered 2026-06-10** — no. If a real-time view is needed again, it will be rebuilt from scratch. T14 closed: `app/(dashboard)/dashboard/` and `components/open-positions-dashboard.tsx` removed.
- **3. Should the IBKR cron stay on GitHub Actions or move to Vercel Cron?** Affects how T9 (cron observability) is scoped — Vercel Cron has built-in delivery + retry semantics, GitHub Actions needs a separate notifier. Either is fine; the question is whether to lean on Vercel's platform or keep cron infra in the repo. **Deferred 2026-06-10** — T9 itself is parked ("if something breaks, a user will contact me"), so this question is parked with it.
- ~~**4. Is `xlsx` an acceptable swap target?**~~ **Answered 2026-06-10** — yes; T1 closed with exceljs and the UI accept tightened to `.xlsx` only.

---

## Discovered During Remediation

> Add new findings here as they surface while working through the plan. Same format: `[ ] T##. Title` + Where / Issue / Acceptance.
