---
name: env-var
description: Adding, renaming or removing an environment variable — the .env.example and Vercel checklist, the NEXT_PUBLIC_ prefix decision, and the full inventory of every env var this app reads and what it is for.
---

# Environment variables

`.env.example` is the source of truth for **which** names are required (no values committed).
This file documents purpose and the checklist for adding one.

## Checklist for a new env var

1. **Add the name** (with a stub value or comment) to [.env.example](../../../.env.example).
   Never commit real secrets.
2. **Document the purpose** in the table below.
3. **Pick the right prefix:**
   - `NEXT_PUBLIC_*` if and only if the value must be reachable from client bundles. See
     [`.claude/rules/client-env-vars.md`](../../rules/client-env-vars.md).
   - No prefix otherwise — server-only.
4. **Set it in the Vercel dashboard** (Production + Preview + Development as appropriate)
   before the change ships.
5. **Reference it from a server-only module** unless the prefix is `NEXT_PUBLIC_*`.

### Why the `.env.example` update matters

`.env.example` is what new developers copy from when onboarding, and it's also what CI setup
scripts compare against. Silently adding a new required var without updating the example
produces cryptic runtime failures on fresh clones.

## Inventory

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser-safe) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser-safe, RLS-bound) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-only, bypasses RLS |
| `DATABASE_URL` / `DIRECT_URL` | Supabase Postgres connection strings (pgbouncer + direct) |
| `FLEX_TOKEN_ENCRYPTION_KEY` | 64-char hex — AES-256-GCM key for IBKR Flex token at rest |
| `MASSIVE_API_KEY` | Massive API key (price data; sync currently disabled) |
| `GEMINI_API_KEY` | Google Gemini API key for the chat assistant |
| `CRON_SECRET` | Bearer token expected by cron endpoints (`/api/cron/*`) |
| `SITE_URL` | Canonical external URL of the app; used by `getBaseUrl()` (`lib/utils.ts`) to build server-side redirects and callbacks. Set in Vercel dashboard (e.g. `https://tradeanalyst.app`). Server-only (no `NEXT_PUBLIC_` prefix). Not needed locally. **Must be the non-redirecting origin** — see the `cron-and-workers` skill for why a `www` value silently breaks every cron. |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN — browser-safe (public). Enables error reporting from both client and server. |
| `SENTRY_AUTH_TOKEN` | Sentry auth token — required only at build time for source-map upload. Server-only. |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key — browser-safe. Powers analytics + signup funnel. |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog cloud host (`https://us.i.posthog.com` by default; `https://eu.i.posthog.com` for EU projects). |
| `LEMONSQUEEZY_API_KEY` | Lemon Squeezy API key for billing |
| `LEMONSQUEEZY_STORE_ID` | Lemon Squeezy store ID |
| `LEMONSQUEEZY_VARIANT_ID_MONTHLY` | LS variant ID for monthly Pro ($11.99/mo) |
| `LEMONSQUEEZY_VARIANT_ID_ANNUAL` | LS variant ID for annual Pro ($107.99/yr) |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | LS webhook signing secret (HMAC-SHA256) |
| `LEMONSQUEEZY_DISCOUNT_CODE_LAUNCH_MONTHLY` | LS discount **code** (not ID) for launch promo monthly ($7.99 × 3mo). Optional — omit after promo ends. The LS checkout API attaches discounts via `checkout_data.discount_code`, not as a `relationships.discount`. |
| `LEMONSQUEEZY_DISCOUNT_CODE_LAUNCH_ANNUAL` | LS discount **code** for launch promo annual ($79.99). Optional — omit after promo ends |
| `AI_IMPORT_DISPATCH_TOKEN` | **Optional.** Fine-grained GitHub PAT (repo access, dispatch) so the AI-Excel-import upload route can `repository_dispatch` the worker for near-instant processing. Server-only. Omit → the schedule in `ai-import-worker.yml` handles jobs instead. |
| `AI_IMPORT_DISPATCH_REPO` | **Optional.** `owner/repo` target for the dispatch above. Server-only. Omit with the token to rely on the schedule. |
| `GEO_GATE_ENABLED` | **Optional. Intended state: `false`/unset** — see [docs/decisions/geo-gate.md](../../../docs/decisions/geo-gate.md). `'true'` enforces the geo gate. Anything else = allow all. Server-only. |
| `GEO_ALLOWED_COUNTRIES` | **Optional.** Comma-separated ISO-3166-1 alpha-2 allow-list for the geo gate. Defaults to `IL`. Server-only. |
| `GEO_BYPASS_SECRET` | **Optional.** Secret for the `?geo_bypass=<secret>` escape hatch (sets a 90-day cookie exempting that browser). Unset = escape hatch disabled. Server-only. |
