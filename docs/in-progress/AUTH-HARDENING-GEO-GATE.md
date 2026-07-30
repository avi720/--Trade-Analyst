# Auth hardening + geo gate

**Branch:** `feat/auth-hardening-and-geo-gate`
**Opened:** 2026-07-30
**Trigger:** forensics on `swbwywsy@gmail.com` (Google OAuth signup, 2026-07-15) — the user
existed in `auth.users` with **no `public.User` row**, and we had *zero* telemetry explaining
why. Root cause was the pre-`08e2c11` callback bug (PKCE exchange failure →
`/login?error=auth_callback_failed`), but the real finding is that the failure was invisible:
no PostHog event, no audit row, nothing. This plan closes the observability gap and shrinks
the anonymous attack surface.

---

## Scope

| # | Item | Status |
|---|---|---|
| 1 | PostHog identity on **every** auth path (incl. Google OAuth) + funnel events for the failure branches | planned |
| 2 | `AuditEvent` rows with IP + user-agent + country for signup / auth-callback outcomes | planned |
| 3 | Geo gate — app + API restricted to Israel, marketing pages stay worldwide | planned |

CAPTCHA (hCaptcha / Turnstile) was **considered and deliberately dropped** — see
[Rejected: CAPTCHA](#rejected-captcha).

---

## 1 — PostHog identity on every auth path

### What it is

`posthog.identify(userId)` is what converts an anonymous PostHog visitor into a *person*
you can look up by ID. Until it is called, events land on an anonymous distinct-id that no
`persons-list` search will ever match.

### Why we have a gap today

`identifyUser()` is called from exactly two places, both inside the **email+password**
signup wizard ([app/(auth)/signup/page.tsx:198](<../../app/(auth)/signup/page.tsx>) and
`:218`). Consequences:

- **Google OAuth users are never identified.** `GoogleSignInButton` redirects to Google,
  Supabase mints the session, and the app resumes on `/research` or `/signup` — no code path
  in between calls `identify`. This is precisely why the PostHog lookup for
  `swbwywsy@gmail.com` returned nothing: not "the user never visited", but "the user was
  never identified".
- **Returning users are never re-identified.** A user who signs in on a new device gets a
  fresh anonymous ID for the whole session.
- The two failure branches of `/auth/callback` emit no event at all.

### Design

**`components/analytics/analytics-identity.tsx`** (new, client) — one component, mounted once
in the **root** layout inside `ConsentProvider`:

- Reads the Supabase session client-side and calls `identifyUser(user.id)` when the current
  PostHog distinct-id doesn't already equal the user id (idempotent — no redundant
  `$identify` events).
- Subscribes to `onAuthStateChange` so a fresh OAuth sign-in identifies the moment the
  session lands, without waiting for a navigation.
- No-ops entirely when analytics consent is absent — consent gating is preserved, nothing is
  sent before opt-in.

Mounting at the **root** (not the dashboard layout) is deliberate: the users we are blind to
are exactly the ones who never reach the dashboard.

**New funnel events** (`FunnelEvent` union in [lib/analytics/posthog.ts](../../lib/analytics/posthog.ts)):

| Event | Fired from | Answers |
|---|---|---|
| `google_signin_clicked` | `GoogleSignInButton` before redirect | how many start the OAuth hop |
| `oauth_callback_failed` | `/signup/verified?reason=exchange_failed` | how many lose the PKCE exchange |
| `login_failed` | `/login?error=…` on mount | how many land on the error screen, and why |

`/auth/callback` gains a `reason=exchange_failed` query param on the PKCE-failure redirect so
`/signup/verified` can tell a **genuine email verification** (no param — show the success copy,
fire nothing) apart from a **failed session exchange** (param present — same copy, but fire
`oauth_callback_failed`). Without the param the page cannot distinguish the two and the metric
would be meaningless.

---

## 2 — `AuditEvent` rows for auth outcomes

### What it is

[lib/audit/log.ts](../../lib/audit/log.ts) already writes `AuditEvent` rows with a
privacy-truncated IP (IPv4 → /24, IPv6 → first 4 groups) and a 500-char user-agent. It is
wired into password/email/tier/subscription changes — but **nothing in the signup or
auth-callback path**. So a bot storm or a broken callback leaves no server-side trace, and
the "is this a real person?" question has no data behind it.

### Two blockers found while planning

1. **`eventType` is constrained.** `audit_event_type_check` is a `CHECK … = ANY (ARRAY[…])`
   over 9 literals. New types need a migration; an unlisted value fails the insert.
2. **`userId` has an FK to `public.User(id)`.** For the case we most want to capture — an
   OAuth callback that dies *before* the `User` row exists — inserting the auth uid would
   violate the FK. `userId` must be `NULL` for those rows, with the auth uid carried in
   `metadata`.

### Design

**Migration** `extend_audit_event_types_for_auth` — drop + recreate the CHECK with three
additions:

- `signup_completed` — profile wizard finished (userId present)
- `oauth_callback_failed` — PKCE exchange failed (userId **null**)
- `auth_callback_no_code` — callback hit with no `code` param; malformed or a bot (userId **null**)

**`lib/audit/log.ts`:**

- `AuditContext.userId` widened to `string | null`.
- Capture `x-vercel-ip-country` into `metadata.country` for **every** audit event, not just
  the new ones — a free retro-fit that makes existing rows geo-aware.

**Call sites:**

| Route | Event | userId |
|---|---|---|
| `app/auth/callback/route.ts` (exchange failed) | `oauth_callback_failed` / failure | `null` |
| `app/auth/callback/route.ts` (no `code`) | `auth_callback_no_code` / failure | `null` |
| `app/api/auth/signup-complete/route.ts` (200) | `signup_completed` / success | `user.id` |

`logAuditEvent` is fire-and-forget and never throws, so none of these can break the auth flow.

**Deliberately not logged: `signup_started`.** It happens in the browser
(`supabase.auth.signUp()`), so capturing it server-side would mean a new *unauthenticated*
POST endpoint — new attack surface to gain a metric PostHog already provides via
`signup_started`. Not worth it.

---

## 3 — Geo gate (Israel-only app, worldwide marketing)

### What it is

Vercel attaches `x-vercel-ip-country` (ISO-3166-1 alpha-2) to every inbound request.
[proxy.ts](../../proxy.ts) — the Next 16 successor to `middleware.ts`, already running on
every non-static request — checks it and rejects requests from outside the allow-list.

### Why the split, and not a blanket block

A blanket block was rejected because this repo is **actively SEO-optimized**: `robots:
{index: true}`, JSON-LD `Organization` + `FAQPage` on `/`, and four dedicated landing pages.
Googlebot crawls from US IPs — blocking it deindexes the site, and social crawlers
(WhatsApp / Facebook / LinkedIn) would stop rendering `/og` link previews. So:

**Geo-OPEN (worldwide)** — public, crawlable, or machine-to-machine:

| Path | Why |
|---|---|
| `/` | landing page, JSON-LD, primary SEO target |
| `/pricing`, `/terms`, `/privacy` | public + legally must stay reachable |
| `/ibkr-sync`, `/fifo-analytics`, `/ai-trading-assistant` | SEO landing pages |
| `/og` | OG image — fetched by social crawlers worldwide |
| `/api/billing/webhook` | Lemon Squeezy calls this from US infra |

**Geo-BLOCKED (allow-list only, default `IL`)** — everything else: `/login`, `/signup`,
`/auth/callback`, `/research`, `/search`, `/manual-import`, `/profile`, `/settings`,
`/admin/*`, and every `/api/*` except the webhook.

Already outside the proxy matcher, so **not affected at all**: `/api/cron/*` (GitHub Actions
runners are US-based — this exclusion is what keeps the crons working), `robots.txt`,
`sitemap.xml`, `_next/static`, and image assets. That pre-existing `api/cron/` exclusion in
the matcher is load-bearing for this feature; do not remove it.

### Fail-open rules — all three are deliberate

The gate allows the request when **any** of these hold:

1. `GEO_GATE_ENABLED !== 'true'` — off by default, so merging this changes no behavior until
   the flag is set in Vercel.
2. `x-vercel-ip-country` is absent — localhost, `next dev`, and any non-Vercel host. Without
   this, local development breaks completely.
3. The country resolves to `XX` — Vercel's "unknown". Refusing to serve users behind
   networks Vercel can't geolocate is a worse failure than letting them through.

A gate that fails *closed* on a missing header would lock the owner out of `next dev` and
out of production the first time Vercel's geo lookup hiccups.

### Escape hatch

Loading any URL with `?geo_bypass=<GEO_BYPASS_SECRET>` sets an HttpOnly / Secure / SameSite=Lax
cookie (`geo_bypass`, 90 days) that exempts that browser, then **redirects to the same URL
without the param** so the secret stays out of browser history, the `Referer` header and
access logs. This is the owner's path back in when travelling. Compared with an IP allow-list
it survives a changing hotel IP; the cost is that the secret is one URL away from being
shared, so it is a *personal* escape hatch, not a distribution mechanism. Rotate
`GEO_BYPASS_SECRET` to invalidate every issued cookie at once.

The cookie carries `Secure`, so browsers will not return it over plain `http`. That makes the
escape hatch a **production-only (https) mechanism** — it cannot be exercised end-to-end
against `http://localhost`. This is the right trade (a bypass credential must never travel in
clear text); local verification sends the cookie explicitly instead of relying on the browser
jar. Not a defect — just don't expect `?geo_bypass=` to work in `next dev`.

### Blocked response

- `/api/*` → **451** JSON `{ error: '…' }` (`Unavailable For Legal Reasons` — semantically
  right for a jurisdiction block, and distinguishable from a 403 auth failure in logs).
- Everything else → **451** self-contained Hebrew HTML page, returned inline from the proxy.
  Inline rather than a rewrite to `/unavailable`: a rewrite target would itself need a
  geo-open exemption, and `NextResponse.rewrite` does not carry a custom status cleanly.

### New env vars

| Name | Default | Purpose |
|---|---|---|
| `GEO_GATE_ENABLED` | *(off)* | `'true'` enforces the gate. Anything else = allow all. |
| `GEO_ALLOWED_COUNTRIES` | `IL` | Comma-separated ISO-3166-1 alpha-2 allow-list. Add a country without a deploy. |
| `GEO_BYPASS_SECRET` | *(unset)* | Secret for `?geo_bypass=`. Unset = the escape hatch is disabled entirely. |

All three are server-only (no `NEXT_PUBLIC_`), read only from `proxy.ts` /
`lib/geo/gate.ts`. Per [env-var-checklist.md](../../.claude/rules/env-var-checklist.md) they
land in `.env.example` + the CLAUDE.md table in this change, and must be set in Vercel
**before** `GEO_GATE_ENABLED=true` is flipped.

---

## Rejected: CAPTCHA

Supabase supports hCaptcha / Cloudflare Turnstile natively (project-level toggle +
`options.captchaToken` on the client). Dropped for now — owner decision 2026-07-30:

- **It would break server-side reauth.** Supabase applies CAPTCHA to the signup, sign-in and
  password-reset endpoints — which includes the `signInWithPassword` in
  [lib/auth/reauth.ts:24](../../lib/auth/reauth.ts). That call runs on the server with no
  captcha token and backs *change-password*, *change-email* and *delete-account*. Enabling
  the toggle silently breaks all three.
- **The remaining bot surface is already small.** Geo-gating `/signup` to Israel plus
  Supabase's built-in auth rate limits plus Google OAuth (which is itself a bot gate) covers
  the realistic abuse cases.
- Revisit if audit rows from item 2 show actual signup abuse. The work is then: widen
  `verifyCurrentPassword` to accept a token, add the widget to the three reauth modals, then
  flip the Supabase toggle — in that order.

---

## Files

**New:** `lib/geo/gate.ts` · `components/analytics/analytics-identity.tsx` ·
`__tests__/geo-gate.test.ts`

**Modified:** `proxy.ts` · `lib/audit/log.ts` · `lib/analytics/posthog.ts` ·
`app/layout.tsx` · `app/auth/callback/route.ts` · `app/api/auth/signup-complete/route.ts` ·
`components/google-signin-button.tsx` · `app/(auth)/login/page.tsx` ·
`app/(auth)/signup/verified/page.tsx` · `.env.example` · `CLAUDE.md`

**DB:** migration `extend_audit_event_types_for_auth`, then regenerate `lib/db/types.ts`
per [migrations.md](../../.claude/rules/migrations.md).

---

## Rollout

**Steps 3–6 were deliberately NOT executed — the geo gate ships disabled and stays that way.**
Decision made 2026-07-30, after the plan was written but before rollout, once the signup data
was actually examined: 4 auth users over two months, all real, all with completed profiles,
zero junk. The gate addressed a threat that had not materialised, while blocking Israelis
travelling abroad from their own journal and contradicting the planned English version.
See the "Geo gate — BUILT, DELIBERATELY OFF" section of [CLAUDE.md](../../CLAUDE.md).

1. ✅ Merge with `GEO_GATE_ENABLED` **unset** — geo gate inert, items 1 + 2 live immediately.
2. ✅ Confirm PostHog shows `google_signin_clicked` and identified persons on real traffic.
3. ⛔ ~~Set `GEO_ALLOWED_COUNTRIES=IL` + `GEO_BYPASS_SECRET=<random>` in Vercel.~~ Harmless to
   leave set if already added — neither is read while the gate is off.
4. ⛔ ~~Set `GEO_GATE_ENABLED=true`.~~ Verify from Israel (app loads), then via VPN (451 on
   `/login`, 200 on `/` and `/pricing`).
5. ⛔ ~~Verify `?geo_bypass=<secret>` restores access while still on the VPN.~~
6. ⛔ ~~Re-check Google Search Console coverage after ~1 week.~~

**Trigger to revisit:** >10 signups in a week from one country that never complete a profile.
The `metadata.country` stamp added in item 3 of this plan is what surfaces that, with the gate
still off. If the trigger fires, steps 3–6 above become live again as written.

## Verification

Automated:

- `npm run test:run` — 481 tests / 36 files green. `__tests__/geo-gate.test.ts` (26 tests)
  covers the path split, the allow-list parser, all three fail-open branches and the bypass
  cookie. Note the live-Supabase integration tests in `__tests__/integration/` are timing-flaky
  (one concurrency case runs ~12 s against a 10 s hook budget) — a failure there is unrelated
  to this change; re-run to confirm.
- `npm run build` — green. `/signup/verified` correctly moves from static to dynamic (it now
  awaits `searchParams`); `/login` stays static, which is why `login_failed` reads
  `window.location.search` instead of `useSearchParams()`.
- `npm run lint` — 0 errors (31 pre-existing warnings, none in the files touched here).
- `npx tsc --noEmit` — clean. This is the gate that would have caught a missed call site after
  widening `AuditContext.userId` to `string | null`.

Manual, against `next dev` with the gate forced on and `x-vercel-ip-country` spoofed as Vercel
sets it — all confirmed:

| Case | Result |
|---|---|
| `US` → `/login`, `/research`, `/signup`, `/api/profile` | **451** |
| `US` → `/`, `/pricing`, `/terms`, `/og` | **200** (SEO + link previews survive) |
| `IL` → `/login`, `/` | **200** |
| `XX` (Vercel can't geolocate) → `/login` | **200** (fails open) |
| no country header (localhost) → `/login` | **200** (fails open) |
| `US` → `/api/cron/ibkr-sync` | **405**, not 451 — reached the handler, proving the matcher exclusion holds and the crons keep working |
| blocked `/api/*` response | `application/json` |
| blocked page response | `text/html`, `dir="rtl"`, `robots noindex` |
| `?geo_bypass=<secret>` from `US` | 307 to the param-stripped URL + `Secure; HttpOnly; SameSite=lax` cookie |
| `?geo_bypass=WRONG` from `US` | **451** |
| valid / invalid / empty bypass cookie from `US` | **200 / 451 / 451** |

Blocked requests complete in ~15 ms vs ~130 ms for allowed ones, confirming the gate
short-circuits before the Supabase `getUser()` round-trip.

Still to check on real traffic (needs production, where `NODE_ENV === 'production'` enables
PostHog): sign in with Google → a PostHog person appears under the auth uid, and
`google_signin_clicked` shows up in the funnel.
