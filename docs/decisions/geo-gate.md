# Decision: the geo gate is built, and deliberately OFF

**Status:** shipped 2026-07-30, disabled the same day. Disabled is the intended steady state.
**Do not turn it on without the evidence described below.**

## Current state

`GEO_GATE_ENABLED` is unset/`false` in Vercel; `evaluateGeoAccess` short-circuits to
`allowed: true` on its first branch, so the whole feature is inert. `GEO_ALLOWED_COUNTRIES` and
`GEO_BYPASS_SECRET` may be present in the dashboard — they are never read while the gate is
off. Only the exact string `true` arms it.

## Why it is off

It was built to blunt bot signups, then shelved once the data was actually checked: at that
point the project had **4 auth users, all real, all with completed profiles, zero junk
signups** across two months. The gate was solving a problem that had never occurred, while
imposing two real costs:

1. **Israelis abroad get locked out of their own trading journal.** Travellers and expats are
   core market, and the bypass secret is not something you hand to customers.
2. **It contradicts the roadmap.** An English version is planned; an English site only
   Israelis can log into is not a product.

## The trigger to enable it

Should abuse ever materialise: *more than ~10 signups in a week from a single country that
never complete a profile.*

The auth telemetry is what detects this — `logAuditEvent` stamps `metadata.country` on every
event, so the evidence accumulates without the gate being on. Flip one env var, redeploy, done.

## Behavior when enabled

Restricts the app + API to `GEO_ALLOWED_COUNTRIES` (default `IL`). Blocked requests get
**451** — JSON for `/api/*`, an inline Hebrew HTML page otherwise.

### The path split is load-bearing, not cosmetic

These stay open worldwide:

- `/`, `/pricing`, `/terms`, `/privacy`, `/ibkr-sync`, `/fifo-analytics`,
  `/ai-trading-assistant` — indexed pages (`robots index:true` + JSON-LD on `/`). Googlebot
  crawls from US IPs; blocking it deindexes the site.
- `/og` — fetched by WhatsApp / Facebook / LinkedIn crawlers to render link previews.
- `/api/billing/webhook` — Lemon Squeezy posts from US infra.
- `/api/cron/*` is already excluded by the **proxy matcher**, which is what keeps the US-based
  GitHub Actions crons working. **Do not remove that exclusion from the matcher** — this one
  applies whether the gate is on or off.

### Fails open in three cases, all deliberate

1. Gate disabled (the default).
2. No `x-vercel-ip-country` header (localhost / `next dev` — failing closed would break local dev).
3. Country `XX` (Vercel couldn't geolocate).

Escape hatch: `?geo_bypass=<GEO_BYPASS_SECRET>` sets a 90-day HttpOnly cookie and redirects to
strip the secret from the URL (keeps it out of history, `Referer` and access logs).

Tests: [__tests__/geo-gate.test.ts](../../__tests__/geo-gate.test.ts).
Plan doc: [docs/in-progress/AUTH-HARDENING-GEO-GATE.md](../in-progress/AUTH-HARDENING-GEO-GATE.md).
