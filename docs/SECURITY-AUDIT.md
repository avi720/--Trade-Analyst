# Trade Analyst — Security Audit & Remediation Plan

> **Audit date:** 2026-06-19
> **Auditor:** Claude (engineering:code-review skill)
> **App version reviewed:** main branch at commit `c6e2b35` + production at https://trade-analyst-lyart.vercel.app

---

## Background

Trade Analyst is a Hebrew RTL trading journal with an AI assistant ("חנן"), built on Next.js 16 App Router + React 19 + Supabase. It is deployed as a multi-user SaaS with public signup at `/signup`; all data is scoped per-user at the DB level via `userId` FKs and `auth.uid() = "userId"` RLS policies. Primary integrations are Interactive Brokers Flex Web Service (encrypted token, twice-daily cron pull) and Google Gemini (chat sidebar with optional full-portfolio context). Production runs on Vercel with a Supabase Postgres backend; service-role access is reserved for cron jobs and the seed script.

**Scope:** This audit covers server-side security of the Next.js API routes, the `proxy.ts` middleware, IBKR Flex token handling, Supabase client usage (RLS vs. service-role), and the AES-256-GCM encryption layer. Out of scope: client-side XSS surface (covered partially by [`docs/UI-AUDIT.md`](UI-AUDIT.md)), performance/DoS surface beyond direct security implications (see [`docs/PERFORMANCE-AUDIT.md`](PERFORMANCE-AUDIT.md)), Supabase RLS policy correctness at the SQL level (assumed correct per CLAUDE.md — not re-verified row-by-row), and dependency CVE scanning.

**Stack reviewed:** Next.js 16 App Router · React 19 · `@supabase/ssr` 0.6 · `@supabase/supabase-js` · Node.js `crypto` (AES-256-GCM) · `fast-xml-parser` (IBKR Flex) · Zod · ExcelJS · `@vercel/functions` (`waitUntil`) · Google Gemini API (`gemini-2.5-pro` / `gemini-2.5-flash`).

**Methodology:**
1. Full read of `proxy.ts`, `lib/utils.ts` (`getBaseUrl`), `lib/ibkr/encrypt.ts`, `lib/ibkr/flex-client.ts`, `lib/supabase/server.ts`, and `lib/supabase/admin.ts`.
2. Full read of every route under `app/api/**/route.ts` (21 routes) and `app/auth/callback/route.ts`.
3. Cross-referenced findings against `CLAUDE.md` guarantees (RLS, `getBaseUrl()`, service-role boundary, IBKR date parsing, FIFO concurrency safeguards) — findings only filed where the code diverges from the documented invariants or extends beyond them.
4. Each item scored internally with `Priority = (Impact + Risk) × (6 − Effort)`, all on a 1-5 scale, to order findings within each phase. Scores are not printed.

**Reference frameworks:** OWASP Top 10 (2021) · OWASP API Security Top 10 (2023) · CWE-287 (Improper Authentication) · CWE-307 (Improper Restriction of Excessive Authentication Attempts) · CWE-770 (Allocation of Resources Without Limits) · CWE-250 (Execution with Unnecessary Privileges) · Supabase RLS guidance · Vercel security best practices for serverless functions.

---

## How to Use This Plan

- Each finding is **outcome-driven**: it states what is wrong and what "fixed" looks like, but **not** how to implement it. The implementer chooses the approach.
- Work top-down by phase. **Do not skip Phase 1** — these are account-takeover-class issues that must clear before further public launch promotion.
- Tick the box only when the **Acceptance** clause is satisfied — not when the change is merely written.
- When an item lands, flip `[ ]` → `[x]` on the heading line. Empty boxes mean unfinished; ticked boxes mean Acceptance met.
- If a finding turns out to be invalid in context, leave the box unchecked and add a `~~strikethrough~~` note explaining why.
- New findings discovered during fixes go at the bottom under "Discovered During Remediation".
- Some findings overlap with [`docs/TECH-DEBT.md`](TECH-DEBT.md) and [`docs/PERFORMANCE-AUDIT.md`](PERFORMANCE-AUDIT.md) (notably the unbounded-input class of issues). The cross-reference is in the Issue line. Fix once; tick the box in both files.

---

## Strengths — What Already Works Well

Preserve these patterns when refactoring:

- **AES-256-GCM is implemented correctly** in [`lib/ibkr/encrypt.ts`](../lib/ibkr/encrypt.ts) — 96-bit IV (the GCM-recommended length), authTag verified on decrypt, key length enforced at load. The construction itself is sound; only the storage format (no version prefix) is open for improvement.
- **RLS-first design** with `auth.uid() = "userId"` on every app table, and the service-role boundary explicitly documented in [`lib/supabase/admin.ts`](../lib/supabase/admin.ts) ("NEVER import this in any code path that is reachable from a browser").
- **Open-redirect mitigation** in [`app/auth/callback/route.ts:9`](../app/auth/callback/route.ts) — `rawNext.startsWith('/')` guard before appending to `getBaseUrl()`.
- **`getBaseUrl()` is server-only** ([`lib/utils.ts`](../lib/utils.ts)) and does not derive from `request.url`, avoiding the open-redirect / phishing-redirect class of bugs that Vercel-hosted Next apps frequently ship.
- **IBKR Flex token redaction** in [`lib/ibkr/flex-client.ts:91-92`](../lib/ibkr/flex-client.ts) and `:106` — `step1UrlSafe` / `step2UrlSafe` are used for logging so the plaintext token never lands in Vercel log storage on the happy path.
- **Mass-assignment protection** in [`app/api/trades/[id]/route.ts:46-51`](../app/api/trades/[id]/route.ts) — explicit `SOFT_FIELDS` whitelist of patchable columns prevents a client from setting `userId`, `realizedPnl`, or other server-computed fields.
- **Idempotent IBKR ingestion** — `Order.brokerExecId` is UNIQUE and the FIFO write path catches `23505` for retries, so a replayed cron run cannot double-book executions.
- **CRON_SECRET Bearer auth** on both cron routes ([`app/api/cron/ibkr-sync/route.ts:127-129`](../app/api/cron/ibkr-sync/route.ts), [`app/api/cron/massive-prices/route.ts:90-92`](../app/api/cron/massive-prices/route.ts)) with an explicit guard that the env var is set (won't silently allow when missing).
- **Zod validation** is used on the most security-sensitive write paths ([`app/api/ibkr/connect/route.ts:15-18`](../app/api/ibkr/connect/route.ts), [`app/api/auth/signup-complete/route.ts:8-20`](../app/api/auth/signup-complete/route.ts), [`app/api/massive/settings/route.ts:12-17`](../app/api/massive/settings/route.ts)) — the pattern is in place and just needs to be applied uniformly.

---

## Findings

ID convention: `X##` numbered globally across phases. Where a finding was confirmed by reading the deployed response or running the code path, the `Issue` line says **"Confirmed."**

---

### Phase 1 — Critical (Day-1 blockers, must clear before next release)

#### [x] X1. Sensitive account changes accept no re-authentication
- **Where:** [`app/api/auth/change-password/route.ts:17-24`](../app/api/auth/change-password/route.ts)
- **Issue:** **Confirmed.** The handler accepts a `newPassword` in the body and calls `admin.auth.admin.updateUserById(user.id, { password: newPassword })` without ever verifying the caller knows the *current* password. Any attacker who obtains a live session (XSS, stolen device, leaked refresh token, malicious browser extension) can change the password and silently lock the legitimate owner out. The Supabase admin API bypasses the email-confirmation step that the user-facing `updateUser` flow would normally enforce.
- **Acceptance:** Endpoint rejects (HTTP 401 or 403) any request that does not include a verifiable proof of current credentials — verified by sending a request with a valid session cookie but an absent or wrong `currentPassword`, and observing rejection without the user's password actually changing in Supabase Auth. A passing case must succeed only when the current password is supplied and confirmed.

#### [x] X2. Email change accepts no re-authentication
- **Where:** [`app/api/auth/change-email/route.ts:17-29`](../app/api/auth/change-email/route.ts)
- **Issue:** **Confirmed.** The handler accepts `newEmail`, performs only `newEmail.includes("@")` shape-check, and calls `admin.auth.admin.updateUserById(user.id, { email: newEmail })` — which skips the Supabase email-change-confirmation flow because it uses service-role privileges. A stolen session can therefore retarget the account's recovery email and complete a full takeover (subsequent "forgot password" goes to the attacker). The `User` table cache is also updated unconditionally.
- **Acceptance:** Endpoint requires either a fresh password confirmation in the same request or routes the change through the standard Supabase email-change confirmation (token sent to the *current* email, change only commits when confirmed) — verified by attempting an email change without re-auth and observing rejection, then attempting with re-auth and observing that the change is gated by a confirmation step the *current* email-holder can refuse.

#### [x] X3. Account deletion requires only a session cookie
- **Where:** [`app/api/auth/delete-account/route.ts:14-19`](../app/api/auth/delete-account/route.ts)
- **Issue:** **Confirmed.** `POST` calls `admin.auth.admin.deleteUser(user.id)` after a session check alone. Account destruction is irreversible (all trades, IBKR connections, AI conversations cascade). A single click in a hijacked session wipes the user's data, and no confirmation prompt at the route layer can recover from it.
- **Acceptance:** Endpoint requires explicit confirmation beyond a logged-in session — either a re-entered password verified server-side, or a confirmation token issued by a separate flow. Verified by sending the request with only the session cookie and observing rejection (HTTP 401/403); a successful run must require the re-auth artefact.

---

### Phase 2 — Important (correctness & integrity)

#### [ ] X4. No rate limiting on auth-sensitive endpoints
- **Where:** All routes under [`app/api/auth/*`](../app/api/auth)
- **Issue:** **Deferred 2026-06-19** — pending owner decision on infra (Upstash Redis vs. Supabase `rate_limit` table). An explainer of the tradeoffs is owed at the end of Phase 3 so the choice can be made informedly. None of the auth-change endpoints or signup-completion apply any rate limiting. A compromised session can hammer `change-email`/`change-password` until it lands the desired state. Vercel's platform-level protection does not apply per-user. Maps to OWASP API4:2023 (Unrestricted Resource Consumption) and CWE-307.
- **Acceptance:** Each named route enforces a per-user limit (e.g., 5 sensitive auth changes / 10 minutes) — verified by sending N+1 requests in the window with a valid session and observing the (N+1)th response is `429 Too Many Requests` with a retry hint header.

#### [x] X5. `/api/trades/import` accepts unbounded file uploads
- **Where:** [`app/api/trades/import/route.ts:30-42`](../app/api/trades/import/route.ts)
- **Issue:** `req.formData()` is followed by `await (file as File).arrayBuffer()` with no `file.size` cap, no MIME type whitelist, and no early `Content-Length` rejection. A 5–10 MB hostile spreadsheet can trigger ExcelJS into worst-case memory consumption inside a 60-second Vercel function. Maps to OWASP API4:2023 / CWE-770. Overlaps with [`docs/PERFORMANCE-AUDIT.md`](PERFORMANCE-AUDIT.md) if a file-upload finding is present there.
- **Acceptance:** Endpoint rejects with HTTP 413 any upload where `file.size` exceeds an explicit cap (suggest 2 MB — verified by uploading a file at cap and at cap+1 byte and seeing the second rejected before parsing begins), and rejects with HTTP 415 any non-`.xlsx` MIME type — verified by sending a `text/plain` file under the size cap.

#### [x] X7. `legs` arrays in manual-trade routes are unvalidated and unbounded
- **Where:** [`app/api/trades/manual/route.ts:17-26`](../app/api/trades/manual/route.ts) and [`app/api/trades/manual/closed/route.ts:20-31`](../app/api/trades/manual/closed/route.ts)
- **Issue:** Both routes accept `body.legs` (or `body.open`/`body.close`) with `Array.isArray` as the only structural check. There is no Zod schema, no `legs.length` upper bound, and no per-leg field validation beyond what `buildExecutions()` enforces. A 50,000-leg payload triggers 50k FIFO operations against the DB inside one request — request times out, partial writes land, and no telemetry distinguishes legitimate users from abuse. Overlaps with [`docs/TECH-DEBT.md`](TECH-DEBT.md) for the Zod-coverage angle.
- **Acceptance:** Both routes apply a Zod schema covering every `ManualLeg` field plus a `.max(N)` constraint on the array (suggest N=500, matching the Excel template limit) — verified by sending a 501-leg payload and observing HTTP 422 with a schema error, and by sending a leg with an unrecognised `side` value and observing HTTP 422 before any DB write.

#### [x] X8. `change-email` shape check accepts unsafe addresses
- **Where:** [`app/api/auth/change-email/route.ts:18`](../app/api/auth/change-email/route.ts)
- **Issue:** Fixed inline alongside X2 (Phase 1) — `change-email` now uses `z.string().email()` via the new Zod schema, rejecting `"@"`, `"a@"`, and `"a@b@c"` with HTTP 400 before any Auth or DB write. `newEmail.includes("@")` is the only validation. Strings like `"@"`, `"a@"`, `"a@b@c"`, or `"<script>@x"` all pass. Supabase Auth will reject most truly malformed addresses, but the `User` table cache update at line 27 will succeed independently, producing inconsistent state if Auth rejects but the cache write does not. This finding becomes moot if X2 is implemented via a confirmation flow, but should be fixed regardless.
- **Acceptance:** `newEmail` is validated with `z.string().email()` before any DB or Auth call — verified by sending `"@"`, `"a@"`, and `"a@b@c"` and observing HTTP 400 with no side effects (no `User.email` write, no `auth.admin.updateUserById` call).

#### [x] X9. Admin (service-role) client used where RLS would suffice
- **Where:** [`app/api/profile/route.ts:65-68`](../app/api/profile/route.ts) (signup-row upsert) · [`app/api/ibkr/connection/route.ts:18-25`](../app/api/ibkr/connection/route.ts) · [`app/api/massive/settings/route.ts:35-39`](../app/api/massive/settings/route.ts) · [`app/api/auth/signup-complete/route.ts:44-70`](../app/api/auth/signup-complete/route.ts) · [`app/api/ibkr/test-connection/route.ts:20-25`](../app/api/ibkr/test-connection/route.ts)
- **Issue:** Each of these routes acquires a `createAdminClient()` after the auth check and then constrains the query with `.eq('userId', user.id)` — meaning the privilege bypass is unnecessary. The current code is correct, but the pattern is fragile: a future copy-paste that drops the `.eq` clause exposes every user's data (CWE-250: Execution with Unnecessary Privileges). The CLAUDE.md guidance says admin client is reserved for "seed scripts, integration tests, server-side cron jobs" — these routes do not match that intent. The Supabase `User` row upsert and `BrokerConnection` read can both be done through the anon client + RLS.
- **Acceptance:** Each named route is converted to use the RLS-bound `createClient()` from `lib/supabase/server.ts`, with the admin client retained only where it must bypass RLS (writing to `User.email` on email-change, deleting an Auth user, fire-and-forget cron-equivalent sync inside `ibkr/connect`). Verified by grep on the routes confirming no `createAdminClient()` usage where RLS would cover the operation, and by manual test that each route still functions for the owning user.

#### [x] X10. Manual-trade date/time inputs are concatenated into `Date()` without format validation
- **Where:** [`app/api/trades/manual/route.ts:46`](../app/api/trades/manual/route.ts) and [`app/api/trades/manual/closed/route.ts:47-48`](../app/api/trades/manual/closed/route.ts)
- **Issue:** `new Date(\`${leg.date}T${leg.time}:00Z\`)` is built from client-supplied strings. Malformed input produces `Invalid Date`; `.getTime()` returns `NaN`; the resulting `brokerExecId = "MANUAL-TICKER-NaN-0"` collides on repeat submissions and can interact badly with the `Order.brokerExecId` UNIQUE constraint. Beyond the bug surface, raw strings are also embedded into error logs and into the rawPayload — log-injection / log-poisoning risk if a `\n` or escape sequence sneaks in.
- **Acceptance:** Date and time fields are validated with strict regex (`^\d{4}-\d{2}-\d{2}$` and `^\d{2}:\d{2}$`) at the Zod layer (covered by X7's Zod schema) and the resulting `Date` is checked with `Number.isFinite(d.getTime())` before any `brokerExecId` is built — verified by sending `leg.date = "not-a-date"` and observing HTTP 422 with no `Order` row written.

#### [x] X11. `CRON_SECRET` is compared with non-constant-time `!==`
- **Where:** [`app/api/cron/ibkr-sync/route.ts:128`](../app/api/cron/ibkr-sync/route.ts) and [`app/api/cron/massive-prices/route.ts:91`](../app/api/cron/massive-prices/route.ts)
- **Issue:** `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` uses a short-circuiting string comparison. On a serverless cold-start path the timing variation is dominated by routing noise, but the OWASP recommendation for any secret comparison is constant-time equality regardless. Low-likelihood at this stack but trivial to fix correctly.
- **Acceptance:** The comparison uses `crypto.timingSafeEqual` on equal-length buffers (with a length-check guard) — verified by code reading and by a smoke test that a wrong secret still returns 401.

---

### Phase 3 — Polish (consistency / hygiene)

#### [x] X12. IBKR encryption format has no version prefix
- **Where:** [`lib/ibkr/encrypt.ts:26`](../lib/ibkr/encrypt.ts) (`iv:authTag:ciphertext`)
- **Issue:** The stored format has no algorithm/version marker. A future key rotation or migration to a different AEAD (e.g., XChaCha20-Poly1305 via `libsodium`) cannot distinguish old from new ciphertexts without an out-of-band marker. Cheap to add now, painful later. No exploitable security flaw today.
- **Acceptance:** Encryption format becomes `v1:iv:authTag:ciphertext` (or equivalent); `decryptToken()` parses the version and dispatches accordingly; a migration script (or lazy re-encryption on next read) updates existing rows — verified by a unit test that decrypts both a pre-migration and a post-migration string and rejects an unknown version prefix.

#### [x] X13. Cron routes accept GET
- **Where:** [`app/api/cron/ibkr-sync/route.ts:171`](../app/api/cron/ibkr-sync/route.ts) (`export const POST = GET;`)
- **Issue:** Convention says state-mutating endpoints should be POST-only. The Bearer auth makes CSRF irrelevant in practice (no cookie used), but a GET-callable mutation appears in browser histories, proxy logs, and bookmark sync. Minor hardening.
- **Acceptance:** Cron routes export `POST` only (or `GET` returns 405) — verified by `curl -X GET` returning 405 and `curl -X POST` with the Bearer header returning the normal payload.

#### [x] X14. API routes depend on `proxy.ts` for auth
- **Where:** [`proxy.ts:67`](../proxy.ts) (matcher) · [`app/api/cities/route.ts`](../app/api/cities/route.ts) (no in-route auth) · [`app/api/trades/import/route.ts:6-12`](../app/api/trades/import/route.ts) (template GET has no in-route auth)
- **Issue:** Auth is enforced by `proxy.ts` redirecting unauthenticated requests to `/login`, with `api/cron/` excluded from the matcher. If the matcher is ever changed (e.g., during a Next.js upgrade or a routing refactor), routes that have no in-handler auth check silently become public. Defence-in-depth says every non-public route should check auth at the handler level *as well*. `/api/cities` is genuinely public-equivalent (govt open data), but `template=true` returns a file with the user's expected fields and should still gate.
- **Acceptance:** Every API route under `app/api/**` either (a) has an explicit auth check at the top of the handler, or (b) is documented in a `PUBLIC_ROUTES` constant with a justification — verified by grep showing each route either calls `supabase.auth.getUser()` first or is listed in the public set.

#### [x] X15. Verbose user-ID logging across cron flow
- **Where:** [`app/api/cron/ibkr-sync/route.ts:37,41,54,76,99`](../app/api/cron/ibkr-sync/route.ts) and similar in `app/api/ibkr/connect/route.ts`
- **Issue:** Every log line includes the raw `userId`. This is not directly exploitable, but it means Vercel log storage (and any downstream log aggregator) holds a per-user activity trail. For a future GDPR/Privacy posture, prefer hashing or truncating user IDs in logs, and avoid embedding them in messages where a counter/aggregate would do.
- **Acceptance:** A `redactUserId(id)` helper exists (e.g., first 6 chars of a HMAC) and is used in log statements where the raw ID adds no debug value — verified by grep on `console.log` in the affected files showing no raw UUID-looking string unless explicitly tagged as a debug-only line.

#### [x] X16. `getBaseUrl()` has no validation of `SITE_URL` shape
- **Where:** [`lib/utils.ts:1-3`](../lib/utils.ts)
- **Issue:** `SITE_URL` is trusted to be a syntactically valid absolute URL with no trailing slash. A misconfiguration (trailing slash, missing protocol) produces auth-callback URLs like `https://example.com//research` or `example.com/research` (no scheme), which redirects fail or silently leak. Defensive hardening — runtime cost is one `new URL()` per call, which is negligible.
- **Acceptance:** `getBaseUrl()` returns a `new URL(process.env.SITE_URL ?? 'http://localhost:3000').origin` (strips trailing slash, validates scheme) — verified by a unit test that confirms inputs `"https://x.com/"`, `"https://x.com"`, and `"http://x.com:80"` all yield identical correct origins, and that a malformed `SITE_URL` throws at startup rather than at first auth callback.

---

## Open Questions / Items Requiring Owner Input

Items that surfaced during the audit but need a product, security, or business decision before they can become actionable findings:

- **Re-auth UX for X1–X3.** What is the preferred UX for re-authentication on sensitive operations — re-enter password modal at the boundary, periodic step-up auth (e.g., re-auth required if session is >15 minutes old), or magic-link-to-email confirmation? The implementation cost differs significantly across these.
- **Rate-limit infrastructure for X4.** Is the team willing to add a dependency (Upstash Redis is the typical Vercel pairing) for per-user rate limiting, or should rate limiting live in Supabase (e.g., via a `rate_limit` table with a function)? The Upstash path is faster to ship; the Supabase path keeps the dependency surface narrower.
- ~~**`FLEX_TOKEN_ENCRYPTION_KEY` storage location.**~~ **Verified 2026-06-19** via Vercel dashboard (Project Settings → Environment Variables). Both `FLEX_TOKEN_ENCRYPTION_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are stored as Project-scoped "Sensitive" env vars in the same `trade-analyst` Vercel project, with the same access list (anyone who can view the project can read both). Implication: the encryption-at-rest of IBKR Flex tokens provides defence only against a DB-only leak (Supabase compromised, Vercel not) — if the Vercel project is compromised, both keys leak together and the encryption adds zero defence. For a single-user proprietary app this is an accepted tradeoff; a future hardening step would be to load `FLEX_TOKEN_ENCRYPTION_KEY` from a separate KMS (AWS KMS, GCP KMS, HashiCorp Vault) with a distinct access path.
- **Public-vs-private route policy for X14.** Should `/api/cities` (Israeli government open data) remain accessible without auth? It is currently gated by the middleware redirect, but treating it as deliberately public would let the matcher exclude it and remove the dependency on middleware behaviour.
- ~~**Audit-log retention.**~~ **Resolved 2026-06-19** — owner confirmed no need for an `AuditEvent` table at this stage. Re-open if regulatory or forensic requirements appear later.

---

## Discovered During Remediation

> Add new findings here as they surface while working through the plan. Same format: `[ ] X##. Title` + Where / Issue / Acceptance.
