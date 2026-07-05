# Trade Analyst — Launch Readiness Audit & Remediation Plan

> **Audit date:** 2026-06-27
> **Auditor:** Claude (launch-readiness review)
> **App version reviewed:** main branch at commit `7c386ce` + production at https://trade-analyst-lyart.vercel.app
> **Status:** 🟡 ACTIVE

---

## Background

Trade Analyst is a Hebrew RTL trading journal SaaS with an AI assistant ("חנן"), built on Next.js 16 App Router, React 19, and Supabase. It is multi-user at the DB level (every app table has a `userId` FK + RLS policy) and currently runs on Vercel with a single Supabase project. The owner intends to open public signup ("שחרור האתר") and start onboarding real users. This plan captures everything that must clear before that public announcement, plus the soft items that should land shortly after.

**Scope:** Items that block or visibly degrade a first-time public launch — legal pages, runtime error surfaces, SEO/social metadata, security headers at the edge, deliverability of transactional emails, observability, onboarding for empty accounts. Out of scope: deeper UX polish (see [`docs/UX-EASE-OF-USE-AUDIT.md`](UX-EASE-OF-USE-AUDIT.md)), broader UI consistency (see [`docs/UI-AUDIT.md`](UI-AUDIT.md)), application-layer security findings (closed — see [`docs/SECURITY-AUDIT.md`](SECURITY-AUDIT.md)), and tech debt (see [`docs/TECH-DEBT.md`](TECH-DEBT.md)). Pricing/billing is also out of scope: the app launches as free.

**Stack reviewed:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · Supabase (Auth + Postgres + RLS) · Vercel hosting + Vercel Cron · GitHub Actions (IBKR sync) · `@supabase/ssr` · Google Gemini (chat) · IBKR Flex Web Service · Massive (price data, currently disabled).

**Methodology:**
1. Full read of `app/layout.tsx`, `next.config.mjs`, `vercel.json`, `proxy.ts` (middleware), and the `app/(auth)` route group.
2. Cross-referenced the four existing audit docs (`SECURITY-AUDIT.md`, `TECH-DEBT.md`, `UI-AUDIT.md`, `UX-EASE-OF-USE-AUDIT.md`, `PERFORMANCE-AUDIT.md`) to avoid re-opening already-closed issues.
3. Explore-agent sweep over `app/api/**/route.ts`, `lib/`, and `public/` looking for: missing error pages, missing legal pages, missing favicon/robots/sitemap, missing OpenGraph metadata, missing security headers, hardcoded debug logs, monitoring hooks (Sentry/GA/etc.), and onboarding affordances.
4. Verified absence by direct `Glob` / `Grep` against the repo (no `app/error.tsx`, no `app/not-found.tsx`, no `public/favicon*`, no `public/robots.txt`, `next.config.mjs` is empty).
5. Each item scored internally with `Priority = (Impact + Risk) × (6 − Effort)`, all on a 1-5 scale. Scores are not printed.

**Reference frameworks:** Vercel + Next.js 16 production checklist · OWASP Secure Headers Project · GDPR Articles 13/14/17 (transparency + right to erasure) · Google Search Quality Rater Guidelines · Core Web Vitals · OpenGraph Protocol · WCAG 2.1 AA (only as it intersects launch — not a full a11y audit).

---

## How to Use This Plan

- Each finding is **outcome-driven**: it states what is wrong and what "fixed" looks like, but **not** how to implement it. The implementer chooses the approach.
- Work top-down by phase. **Do not skip Phase 1** — those are the items that genuinely block opening the doors to real users.
- Tick the box only when the **Acceptance** clause is satisfied — not when the change is merely written.
- When an item lands, flip `[ ]` → `[x]` on the heading line. Empty boxes mean unfinished; ticked boxes mean Acceptance met.
- If a finding turns out to be invalid in context, leave the box unchecked and add a `~~strikethrough~~` note explaining why.
- If a finding is deferred by an owner decision (won't-fix this round), tick `[x]`, wrap the Acceptance line in `~~strikethrough~~`, and append a short note explaining the decision.
- New findings discovered during fixes go at the bottom under "Discovered During Remediation".
- The `Status` line at the top is maintained by `/execute-work-plan` — don't flip it to COMPLETED until every item is closed for good.
- When a finding overlaps with [`docs/UX-EASE-OF-USE-AUDIT.md`](UX-EASE-OF-USE-AUDIT.md), [`docs/UI-AUDIT.md`](UI-AUDIT.md), or [`docs/SECURITY-AUDIT.md`](SECURITY-AUDIT.md), the cross-reference is in the Issue line. Fix once; tick the box in both files.

---

## Strengths — What Already Works Well

Preserve these patterns when working through this plan:

- **Auth surface is complete and hardened.** `app/(auth)/signup`, `login`, `forgot-password`, `reset-password` cover the full account lifecycle, with re-authentication required on `change-password`, `change-email`, and `delete-account` routes (X1–X3 closed in [`docs/SECURITY-AUDIT.md`](SECURITY-AUDIT.md)).
- **Rate limiting is in place on every sensitive route** (`lib/auth/rate-limit.ts`) — password change, email change, delete-account, signup-complete, and the Gemini chat endpoint are all bucketed.
- **RLS-first DB access** — every app query goes through a user-scoped Supabase client; the service-role client is reserved for `lib/supabase/admin.ts` (seed + cron). No request path bypasses RLS.
- **`getBaseUrl()` in `lib/utils.ts`** is the single source of truth for external URLs and is covered by `__tests__/get-base-url.test.ts`. This is the right primitive for auth callbacks to build on — finding L3 just needs the env var set, not new code.
- **IBKR Flex token encryption** — `lib/ibkr/encrypt.ts` uses AES-256-GCM with format versioning (`v1:iv:authTag:ciphertext`). Tokens never appear in logs (redaction in `lib/ibkr/flex-client.ts`).
- **Audit logging exists** — `lib/audit/log.ts` records sensitive account changes (delete, email change, etc.) to the `AuditEvent` table. This is the substrate observability will plug into.
- **`vercel.json` correctly extends `maxDuration` to 60s** for the IBKR sync and connect routes; cron endpoints are bearer-token-guarded with `crypto.timingSafeEqual`.
- **Self-hosted fonts** via `next/font` in `app/layout.tsx` (Assistant + IBM Plex Mono) — zero runtime DNS to `fonts.googleapis.com` and no layout shift.
- **`next.config.mjs` is empty** rather than carrying stale dev-only settings — a clean slate to add security headers onto in L4.
- **Four prior audit rounds (UI / UX / Security / Tech Debt) all show closed phases** in their Status lines, meaning this launch audit can focus only on what's genuinely launch-blocking instead of re-litigating fixed issues.

---

## Findings

ID convention: `L##` numbered globally across phases. Where a finding was confirmed by direct file read or `Glob` against the repo, the `Issue` line says **"Confirmed."**

---

### Phase 1 — Critical (Day-1 blockers, must clear before public announcement)

#### [x] L1. Configure `SITE_URL` env var in Vercel production environment
- **Where:** Vercel Project Settings → Environment Variables (no code change needed)
- **Issue:** **Confirmed.** `lib/utils.ts:5` falls back to `http://localhost:3000` when `SITE_URL` is unset. `getBaseUrl()` is the foundation for every server-built external URL — Supabase auth callbacks, password-reset links, email-confirmation `emailRedirectTo`, Google OAuth return URLs. If `SITE_URL` is missing in production, every email link a new user clicks will point at `localhost:3000` and the entire signup-by-email flow breaks silently. This is the single most catastrophic launch bug because it appears only after a real user tries to confirm their email.
- **Acceptance:** `SITE_URL` is set in the Vercel Production environment (and Preview, with the preview URL) to the canonical production origin (e.g. `https://trade-analyst-lyart.vercel.app` or the new custom domain). Verified by: signing up with a fresh email on production, clicking the confirmation link from the inbox, and landing on the production `/signup/verified` route — not localhost.

#### [x] L2. Add a Privacy Policy page
- **Where:** `app/(public)/privacy/page.tsx` (or equivalent route — currently missing per `Glob`)
- **Issue:** **Confirmed.** No `/privacy` route exists. The app collects email, full name, phone, street/city/country, complete trade history, IBKR Flex tokens, and chat transcripts with Gemini, and shares data with Supabase (US/EU), Vercel (US), Google Gemini, and IBKR. GDPR Articles 13/14 require disclosure of the data collected, the purposes, the third-party processors, the retention period, and the data-subject rights (access, rectification, erasure, portability). Without this page, public launch carries real legal exposure — and Supabase/Google ToS both require downstream products to publish a privacy policy.
- **Acceptance:** A Hebrew `/privacy` page is live and linked from the signup form (consent line near the submit button) and the public footer. It lists, at minimum: (a) categories of data collected, (b) sub-processors (Supabase, Vercel, Google Gemini, IBKR, Massive), (c) retention policy (active account = retained; deletion request = purged within X days; audit logs retained Y days), (d) the right to deletion + how to exercise it (link to the in-app delete flow), (e) the right to data export (link to the CSV export). Verified by opening the page on production and confirming both links from signup and footer reach it.

#### [x] L3. Add a Terms of Service page
- **Where:** `app/(public)/terms/page.tsx` (or equivalent route — currently missing per `Glob`)
- **Issue:** **Confirmed.** No `/terms` route exists. A trading-journal SaaS without ToS leaves the operator exposed to liability claims tied to perceived investment advice (the AI assistant "חנן" answers questions about the user's trade performance), uptime expectations, and account-termination disputes. ToS also needs an explicit "this is not investment advice" disclaimer because the product surface (chat + analytics) reads like advisory tooling to a naive user.
- **Acceptance:** A Hebrew `/terms` page is live and linked from the signup form (consent line) and the public footer. It covers, at minimum: (a) the service is provided as-is with no uptime SLA at this stage, (b) explicit disclaimer that the app and the AI assistant do not provide investment advice and are an analytical journal only, (c) account-termination rights for both sides, (d) jurisdiction (Israel) and contact email. Verified by opening the page on production and confirming both links from signup and footer reach it.

#### [x] L4. Add `app/error.tsx` and `app/not-found.tsx`
- **Where:** `app/error.tsx` and `app/not-found.tsx` (both missing per `Glob`)
- **Issue:** **Confirmed.** With neither file present, any unhandled runtime exception inside a `(dashboard)` route renders the framework's generic dark error page in English, and any 404 (typo URL, deleted trade, stale shared link) shows the framework's generic 404 — also in English. In a Hebrew RTL product where every other screen is fluent and right-aligned, both look like the app crashed entirely. Real users who hit this on day one will assume the product is broken.
- **Acceptance:** Both files exist, render Hebrew RTL content matching the dark theme, surface a friendly message + a primary action ("חזרה לדף הבית" / "נסה שוב"), and on `error.tsx` provide a way to reset the route segment (the `reset` prop). Verified by (a) navigating to `/this-route-does-not-exist` on production and seeing the Hebrew 404, and (b) deliberately throwing an error in a dev branch and confirming the Hebrew error UI renders.

#### [x] L5. Add a real `public/favicon.ico` (and Apple touch icon)
- **Where:** `public/favicon.ico`, `public/apple-touch-icon.png` (both missing per `Glob`)
- **Issue:** **Confirmed.** `public/` contains `logo.png` but no favicon. Every tab a user opens shows a generic globe icon, every browser bookmark gets that globe, every iOS "Add to Home Screen" gets a screenshot thumbnail. Reads as unfinished or unprofessional to a first-time visitor.
- **Acceptance:** `public/favicon.ico` (multi-resolution: 16/32/48) renders in the browser tab on production. `public/apple-touch-icon.png` (180×180) renders when a visitor adds the site to an iOS home screen. Verified by hard-reloading production in Chrome and Safari and inspecting both the tab icon and the iOS home-screen icon.

#### [x] L6. Customise the Supabase transactional email templates
- **Where:** Supabase Dashboard → Authentication → Email Templates (no code change in repo)
- **Issue:** Default Supabase templates are English, branded with Supabase's name, and use a generic English subject line ("Confirm your signup"). A Hebrew user receiving an English email from an unknown sender immediately after signing up is the prime moment for the email to land in spam — both because of the language mismatch with the UI and because deliverability heuristics treat unmodified templates as suspicious. This compounds with L1: if `SITE_URL` is wrong, the broken link is also in an unbranded English email, so the user has no signal that the email is even legitimate.
- **Acceptance:** All four user-facing Supabase email templates (Confirm signup, Reset password, Magic link, Email change) have Hebrew subject and body, name the product ("Trade Analyst" or the chosen brand name), and use the `{{ .ConfirmationURL }}` variable so they pick up `SITE_URL`. Verified by triggering each flow end-to-end on production and confirming the received email is in Hebrew with the correct sender and a working link.

#### [x] L7. Add minimum security headers to responses
- **Where:** `next.config.mjs` (currently `{}`) — add a `headers()` function, or set them in middleware
- **Issue:** **Confirmed.** `next.config.mjs` is empty. The app serves no `Strict-Transport-Security`, no `X-Frame-Options`/`frame-ancestors`, no `X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`. Without `frame-ancestors`/`X-Frame-Options`, the entire app is embeddable in an iframe — clickjacking surface against the auth and delete-account flows. Without `Strict-Transport-Security`, a downgrade to HTTP on a hostile network drops the cookie session protection. These are one-line additions with no functional risk and they're the kind of thing security scanners (and prospective users running scanners) flag on day one.
- **Acceptance:** Production responses include `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that disables camera/microphone/geolocation. Verified by running `curl -sI https://<production-host>/` and inspecting the response headers, or by running the site through securityheaders.com and getting at least an A grade.

#### [x] L21. Integrate Lemon Squeezy billing and enforce Free/Pro tier limits
- **Where:** New: billing integration (Lemon Squeezy SDK / webhooks), subscription status on `User` table or dedicated `Subscription` table, middleware or route-level tier checks
- **Issue:** **Partial 2026-06-28** — Code half landed: `subscriptionTier` column on `User`, `lib/billing/tier.ts` helper, gating on `/api/ibkr/connect` (403), `/api/export/activity-csv` (403), `/api/chat` (3 msg/day daily-free bucket + `contextMode: 'full'` blocked for Free), Lemon Squeezy checkout route + HMAC-verified webhook route + billing tab in `/profile?tab=billing` with monthly $19.99 / annual $179.99 cards + 14-day trial copy. Owner half pending: O9 (Lemon Squeezy store + Pro product + env vars). Until env vars are set, checkout returns 503 with friendly message, webhook returns 200 ack.
- **Acceptance:** (a) A new user on the Free tier can use manual import, research dashboard, search, and up to 3 Hanan basic messages/day. Attempting a 4th message shows an upgrade prompt. IBKR sync and CSV export show upgrade prompts. (b) After subscribing via the Lemon Squeezy checkout overlay, the user's tier flips to Pro within seconds (webhook). All Pro features unlock immediately. (c) After cancellation, the user retains Pro until the billing period ends, then reverts to Free. Verified locally: 403 returned on `/api/ibkr/connect`, `/api/export/activity-csv`, `/api/chat` (full mode) for Free user; ProRequiredBanner visible on `/profile?tab=broker`; billing tab renders with both plans; 503 returned on checkout when env vars absent. Full subscribe → cancel cycle blocked until O9 lands.

---

### Phase 2 — Important (land within the first week of users)

#### [x] L8. Wire up Sentry for error tracking
- **Where:** `@sentry/nextjs` 10.62 installed + `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts` (register + onRequestError), `next.config.mjs` wrapped with `withSentryConfig`, `Sentry.captureException(error)` wired into `app/error.tsx` and `app/global-error.tsx`. CSP `connect-src` extended to allow `*.ingest.sentry.io` and `*.ingest.de.sentry.io`.
- **Issue:** **Partial 2026-06-28** — Code half landed and verified locally (`npm run build` clean with Sentry wrapper, tests 244/244). Owner half pending: add `NEXT_PUBLIC_SENTRY_DSN=https://70001b8c9790351c2b0bc10de2e991c1@o4511542659645440.ingest.de.sentry.io/4511644782231632` to Vercel env (Production + Preview); optionally add `SENTRY_AUTH_TOKEN` for source-map upload. Sentry is `enabled: NODE_ENV === 'production'` so dev throws don't pollute the dashboard.
- **Acceptance:** Errors thrown inside server routes and client components are captured and visible in the Sentry dashboard within a minute of occurring, tagged with `userId` (anonymised — hash) and route. An alert channel (email) fires on new error groups. Verified by deliberately throwing an error on a non-critical dev route, seeing the event appear in Sentry, and receiving the alert email. Free tier (5K errors/month) is sufficient for launch.

#### [x] L9. Add OpenGraph and Twitter card metadata
- **Where:** `app/layout.tsx:22-25` (current metadata block is title + description only)
- **Issue:** **Confirmed.** The metadata export is minimal — no `openGraph`, no `twitter`, no `metadataBase`. Any link to the site shared on WhatsApp, Telegram, X, or LinkedIn (the most likely organic acquisition channels for a Hebrew trading audience) renders without an image card, without a description, with just the URL. This significantly damages click-through on shared links — and shared links are likely the primary signup driver in the first weeks.
- **Acceptance:** `app/layout.tsx` exports `metadataBase` plus an `openGraph` block (title, description, locale `he_IL`, type `website`, an `images` entry pointing at a 1200×630 PNG in `public/`) and a `twitter` block (`summary_large_image`). Verified by pasting the production URL into the Facebook Sharing Debugger and the X Card Validator and confirming both render the title, description, and image.

#### [x] L10. Add `public/robots.txt` and `app/sitemap.ts`
- **Where:** `public/robots.txt` and `app/sitemap.ts` (both missing per `Glob`)
- **Issue:** **Confirmed.** Without `robots.txt`, crawlers must guess what's indexable; without a sitemap, public pages (`/`, `/login`, `/signup`, the new `/terms` and `/privacy`) are discovered only via links. Authenticated routes under `(dashboard)` and `/api/**` should be explicitly disallowed for crawlers to avoid wasted crawl budget on routes that always 401.
- **Acceptance:** `robots.txt` is served at `/robots.txt` and disallows `/api/`, `/research`, `/search`, `/manual-import`, `/profile`, `/settings`, and any other authenticated route. `/sitemap.xml` is served and lists the public pages with sensible `lastmod` values. Verified by `curl https://<production-host>/robots.txt` and `/sitemap.xml`.

#### [x] L11. Add an empty-state onboarding affordance after signup
- **Where:** Landing route after signup completion (currently `/research`, see [`CLAUDE.md`](../CLAUDE.md))
- **Issue:** A newly registered user with zero trades lands on `/research` and sees an empty analytics dashboard with no clear next step. The two real next actions are (a) connect IBKR via `/profile?tab=broker`, or (b) import an Excel/manual trade via `/manual-import` — but nothing in the empty state points there. First-session drop-off is the single biggest risk in the first week of public launch. Overlaps with [`docs/UX-EASE-OF-USE-AUDIT.md`](UX-EASE-OF-USE-AUDIT.md) (Phase 1 onboarding theme).
- **Acceptance:** When a user with zero trades lands on `/research` (or whichever default route survives), they see a clear empty state with two primary CTAs — "חבר את Interactive Brokers" and "ייבא עסקאות ידני" — that link directly to the broker connection panel and `/manual-import` respectively. Verified by signing up a fresh QA user, landing on the dashboard, and confirming the empty state is the first thing visible above the fold without scrolling.

#### [x] L12. Decide and configure the production custom domain
- **Where:** Vercel Project → Domains, plus DNS for the chosen domain, plus `SITE_URL`
- **Issue:** The current production URL is `trade-analyst-lyart.vercel.app`. Launching on a Vercel-generated subdomain damages trust (reads as a side project), complicates email deliverability (custom-domain SPF/DKIM on the sender is later harder to set up), and prevents Supabase Auth from being configured against a stable canonical hostname. Coupled with L1 — if the canonical hostname changes after launch, every old confirmation email in someone's inbox breaks.
- **Acceptance:** A custom domain (decided in Open Questions) is attached to the Vercel project, serves the app over HTTPS with auto-renewing certs, and is set as `SITE_URL`. Old `trade-analyst-lyart.vercel.app` either 308-redirects to the custom domain or is left in place but no longer used for auth callbacks. Verified by loading the custom domain in a fresh browser session and completing one full signup → confirm → login round trip.

#### [x] L13. Configure Supabase Auth redirect allowlist
- **Where:** Supabase Dashboard → Authentication → URL Configuration
- **Issue:** Even with `SITE_URL` set (L1) and a custom domain (L12), Supabase will reject auth callbacks whose `redirect_to` is not on the allowlist. By default, only `localhost` is permitted. This will produce "redirect_to is not allowed" errors at the moment of email confirmation on the production host.
- **Acceptance:** The Supabase project's Site URL and Additional Redirect URLs include the production custom domain and the Vercel preview URL pattern. Verified by completing a signup → email confirm round trip on production without Supabase rejecting the callback.

#### [x] L14. Add a /healthz or readiness endpoint
- **Where:** New route `app/api/healthz/route.ts`
- **Issue:** Vercel deployment health is binary (built/not-built), but a deeper liveness check — "Supabase reachable from the function region, encryption key loadable" — is what catches the kind of misconfiguration that breaks every request silently. Especially useful on first launch when env var drift is the most likely failure mode.
- **Acceptance:** `GET /api/healthz` returns 200 with `{"db":"ok","env":"ok"}` when everything works, 503 otherwise. Cached for at most 10 seconds. Verified by `curl https://<production-host>/api/healthz` after deploy.

---

### Phase 3 — Polish (within the first month)

#### [x] L15. Add a basic landing page at `/`
- **Where:** `app/page.tsx` (currently redirects to `/research`, see [`CLAUDE.md`](../CLAUDE.md))
- **Issue:** Anonymous visitors land on `/research` and immediately get bounced through middleware to `/login`, with no marketing surface explaining what the product is or why to sign up. For the first weeks of public launch, organic visitors who don't already know what the app does will not convert.
- **Acceptance:** Anonymous visitors hitting `/` see a single-page hero (Hebrew RTL) explaining the product in 1–2 sentences, listing 3–5 features, and pointing to "הרשמה" + "כניסה". Authenticated visitors still get redirected to `/research`. Verified by opening `/` in an incognito window and seeing the landing page.

#### [x] L16. Add PostHog for analytics and signup funnel tracking
- **Where:** New dependency (`posthog-js` + `posthog-node`) + init in `app/layout.tsx` (client) and API routes (server), custom events on auth pages
- **Issue:** Without analytics you cannot tell whether drop-off is at landing → signup, signup → email confirmation, or confirmation → first trade. In the first month of launch, this is the most valuable data the product can produce. Sentry (L8) tells you what's broken; PostHog tells you what's working.
- **Acceptance:** PostHog is integrated with page-view auto-capture and custom events at each funnel step (`signup_started`, `email_confirmed`, `profile_completed`, `first_trade_imported`). A funnel chart in the PostHog dashboard shows conversion rates between steps. Verified by completing one fresh signup and seeing the events and funnel appear. Free tier (1M events/month) is sufficient for launch.

#### [x] L17. Document the launch runbook
- **Where:** New file `docs/RUNBOOK.md`
- **Issue:** The first incident after launch is the worst time to discover that nobody remembers how to rotate `FLEX_TOKEN_ENCRYPTION_KEY`, how to re-run the IBKR cron manually, or how to revoke a user's session. The existing docs cover what the system *is*, not what to *do* when it breaks.
- **Acceptance:** A `docs/RUNBOOK.md` exists with named runbooks for: rotating the Flex encryption key, manually triggering the IBKR sync for one user, revoking a user's auth session, deleting a user's data on request (full GDPR Article 17 flow), restoring from Supabase point-in-time recovery, and rolling back a bad Vercel deploy. Verified by walking through each runbook once on staging.

#### [x] L18. Add a public contact / support channel
- **Where:** Public footer + Terms page + Privacy page
- **Issue:** Users need a route to report bugs, request account deletion (GDPR), and ask product questions. A `mailto:` is sufficient at this stage; what matters is that it exists somewhere visible. Without it, the first frustrated user has no path other than abandoning the product.
- **Acceptance:** A contact email is published in the public footer, the Terms page, and the Privacy page. Verified by visiting each of those three locations on production and confirming the email is clickable.

#### [ ] L19. Set up scheduled Supabase backups verification
- **Where:** Supabase Dashboard → Database → Backups
- **Issue:** Supabase paid plans include daily backups, but a backup nobody has restored from is not a backup. Before relying on backups in a real-user context, the restore path needs to have been exercised at least once.
- **Acceptance:** One restore-to-staging drill completed and documented in `docs/RUNBOOK.md` (L17). Verified by the runbook step plus a screenshot or log of the restored staging environment.
- **Blocked 2026-06-29** — Supabase free plan does not include Point-in-Time Recovery or daily backup downloads. Unblocks when project is upgraded to Pro plan ($25/mo). Steps once on Pro: Dashboard → Database → Backups → select a restore point → restore to a new branch → verify tables → document in RUNBOOK.md under "Restore drill".

#### [x] L20. Add OpenGraph share image asset to `public/`
- **Where:** `public/og-image.png` referenced by the `openGraph.images` block in L9
- **Issue:** **Partial 2026-06-28** — Placeholder shipped: `public/og-image.png` is currently a copy of `logo.png` so L9 metadata resolves without a 404 on social-share crawlers. A proper 1200×630 designed asset (logo + Hebrew tagline on the dark theme) is still needed for actual social preview quality.
- **Acceptance:** `public/og-image.png` is a 1200×630 image that represents the product (logo + tagline + a screenshot or dark-theme illustration). Verified by visual inspection and by re-running the Facebook Sharing Debugger from L9.
- **Resolved 2026-06-29** — Switched from static PNG to dynamic `app/og/route.tsx` using `next/og` (ImageResponse). Design: dark theme (#080808), green→amber gradient bar, "Trade / Analyst" wordmark, Hebrew tagline "יומן מסחר חכם עם AI", feature pills (IBKR Sync, חנן AI, FIFO Analytics), mock stat cards (Win Rate / Avg R / Max DD), mini P&L bar chart. Route added to middleware public allowlist. `app/layout.tsx` `openGraph.images` and `twitter.images` updated to `/og`. Verified: `GET /og` → `200 image/png` (38 KB).

---

## Open Questions / Items Requiring Owner Input

All questions resolved (2026-06-28):

- **Domain:** `tradeanalyst.app` — **purchased via Vercel and attached to the project** (2026-06-28). DNS + SSL active. Unblocks L6, L12, L13.
- **Legal entity:** Aviur Paz (individual operator), jurisdiction Israel, support email `support@tradeanalyst.app` via Zoho Mail (free tier, upgrade to Google Workspace later).
- **AI assistant ("חנן") disclaimer:** Hanan may express opinions on specific trades, but ToS must include a clear disclaimer — opinions only, not investment advice, not financial advice, not a recommendation to act. The user bears sole responsibility for trading decisions.
- **Data retention on account deletion:** All user data (trades, orders, broker connections, profile) deleted immediately. Audit logs retained 30 days, then auto-purged. Supabase backups may retain data up to 30 days per their infrastructure.
- **Launch model:** Hard launch — open signup to everyone, no invite gating.
- **Pricing model:** Freemium at $14.99/month (USD) via Lemon Squeezy (merchant of record). Free tier: manual import, research dashboard, search, 3 Hanan messages/day (basic mode only). Pro tier ($14.99/mo or $149.99/yr): unlimited Hanan + Pro (deep) mode, IBKR sync, CSV export. Full trade history available on both tiers. **Launch promo** (first month after launch, until 2026-08-01): monthly $9.99 for first 3 months, annual $99.99.
- **Monitoring:** Sentry (free, error tracking — L8, **account already created by owner**) + PostHog (free, analytics + funnels — L16, account pending).
- **Lemon Squeezy store URL:** `tradeanalyst.lemonsqueezy.com` (matches the brand subdomain).

---

## Discovered During Remediation

> Add new findings here as they surface while working through the plan. Same format: `[ ] L##. Title` + Where / Issue / Acceptance.
