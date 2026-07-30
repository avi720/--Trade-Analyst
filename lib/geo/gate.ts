// Geo gate — restricts the app + API to an allow-list of countries (default: Israel)
// while leaving the public marketing surface reachable worldwide.
//
// Consumed only by proxy.ts. Server-only: reads non-NEXT_PUBLIC_ env vars, so it must
// never be imported from a "use client" component (see .claude/rules/client-env-vars.md).
//
// Rationale, path split and rollout live in docs/in-progress/AUTH-HARDENING-GEO-GATE.md.

/** Cookie set by the `?geo_bypass=<secret>` escape hatch. */
export const GEO_BYPASS_COOKIE = "geo_bypass";

/** Query param that mints the bypass cookie. */
export const GEO_BYPASS_PARAM = "geo_bypass";

/** 90 days, in seconds. */
export const GEO_BYPASS_MAX_AGE = 60 * 60 * 24 * 90;

/**
 * Paths that stay reachable from every country.
 *
 * Two distinct reasons a path lands here — both load-bearing:
 *   1. SEO / social. `/` carries the JSON-LD Organization + FAQPage blocks and the
 *      landing pages are indexed (robots index:true). Googlebot crawls from US IPs, and
 *      `/og` is fetched by WhatsApp / Facebook / LinkedIn crawlers. Blocking these
 *      deindexes the site and kills link previews.
 *   2. Machine-to-machine. Lemon Squeezy posts to /api/billing/webhook from US infra.
 *
 * NOTE: /api/cron/* is NOT listed because proxy.ts's matcher already excludes it — the
 * GitHub Actions runners that call the crons are US-based, so that exclusion is what keeps
 * them working. Do not remove it from the matcher.
 */
const GEO_OPEN_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/pricing",
  "/terms",
  "/privacy",
  "/ibkr-sync",
  "/fifo-analytics",
  "/ai-trading-assistant",
  "/og",
  "/api/billing/webhook",
]);

/** Vercel's placeholder when it cannot resolve a country. */
const UNKNOWN_COUNTRY = "XX";

const DEFAULT_ALLOWED_COUNTRIES = ["IL"];

export function isGeoOpenPath(pathname: string): boolean {
  return GEO_OPEN_PATHS.has(pathname);
}

/** True once GEO_GATE_ENABLED is explicitly 'true'. Off by default so merging is inert. */
export function isGeoGateEnabled(env: Record<string, string | undefined>): boolean {
  return env.GEO_GATE_ENABLED === "true";
}

/**
 * Parses GEO_ALLOWED_COUNTRIES ("IL,US" → Set{'IL','US'}). Case- and whitespace-tolerant so
 * a stray " il" in the Vercel dashboard doesn't silently lock everyone out. Falls back to
 * Israel when unset or when the value parses to nothing usable.
 */
export function parseAllowedCountries(raw: string | undefined): ReadonlySet<string> {
  const parsed = (raw ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  return new Set(parsed.length > 0 ? parsed : DEFAULT_ALLOWED_COUNTRIES);
}

/**
 * Country for this request, or null when the host does not provide one (localhost,
 * `next dev`, any non-Vercel deployment).
 */
export function resolveCountry(headers: Headers): string | null {
  const country = headers.get("x-vercel-ip-country");
  if (!country) return null;
  const trimmed = country.trim().toUpperCase();
  return trimmed || null;
}

export interface GeoDecision {
  allowed: boolean;
  /** Resolved country, or null when the host provided none. For logging. */
  country: string | null;
  /**
   * Why the request was allowed / denied. Drives nothing — exists so a surprising
   * production decision can be explained from a log line.
   */
  reason:
    | "gate_disabled"
    | "open_path"
    | "bypass_cookie"
    | "no_country_header"
    | "unknown_country"
    | "country_allowed"
    | "country_blocked";
}

export interface GeoRequestInfo {
  pathname: string;
  headers: Headers;
  /** Value of the geo_bypass cookie, if present. */
  bypassCookie?: string;
}

/**
 * The gate. Fails OPEN in three cases, all deliberate:
 *
 *   1. gate disabled       — default state; merging this code changes nothing.
 *   2. no country header   — localhost / non-Vercel host, otherwise `next dev` breaks.
 *   3. country is 'XX'     — Vercel could not geolocate. Turning away a real user behind an
 *                            odd network is worse than letting an occasional bot through.
 *
 * A gate that failed closed on a missing header would lock the owner out of local dev and
 * out of production the first time Vercel's geo lookup hiccuped.
 */
export function evaluateGeoAccess(
  info: GeoRequestInfo,
  env: Record<string, string | undefined>,
): GeoDecision {
  const country = resolveCountry(info.headers);

  if (!isGeoGateEnabled(env)) {
    return { allowed: true, country, reason: "gate_disabled" };
  }

  if (isGeoOpenPath(info.pathname)) {
    return { allowed: true, country, reason: "open_path" };
  }

  // Escape hatch. Disabled entirely when the secret is unset, so an empty env var can never
  // be matched by an empty cookie.
  const secret = env.GEO_BYPASS_SECRET;
  if (secret && info.bypassCookie && info.bypassCookie === secret) {
    return { allowed: true, country, reason: "bypass_cookie" };
  }

  if (!country) {
    return { allowed: true, country, reason: "no_country_header" };
  }

  if (country === UNKNOWN_COUNTRY) {
    return { allowed: true, country, reason: "unknown_country" };
  }

  const allowedCountries = parseAllowedCountries(env.GEO_ALLOWED_COUNTRIES);
  return allowedCountries.has(country)
    ? { allowed: true, country, reason: "country_allowed" }
    : { allowed: false, country, reason: "country_blocked" };
}

/**
 * True when `?geo_bypass=<secret>` on this request matches GEO_BYPASS_SECRET, i.e. the
 * caller should be issued the bypass cookie.
 */
export function isBypassGrant(
  searchParams: URLSearchParams,
  env: Record<string, string | undefined>,
): boolean {
  const secret = env.GEO_BYPASS_SECRET;
  if (!secret) return false;
  return searchParams.get(GEO_BYPASS_PARAM) === secret;
}

/** Hebrew 451 page for blocked document requests. Self-contained — no app CSS available. */
export function geoBlockedHtml(): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Trade Analyst — לא זמין באזורך</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    background: #080808; color: #E0E0E0; padding: 1.5rem;
    font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
  }
  .card {
    background: #111111; border: 1px solid #222222; border-radius: 12px;
    padding: 2rem; max-width: 26rem; text-align: center;
  }
  h1 { font-size: 1.25rem; margin: 0 0 0.75rem; color: #E0E0E0; }
  p { font-size: 0.9rem; line-height: 1.7; color: #888888; margin: 0; }
  .brand {
    font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem; color: #FFB800; letter-spacing: 0.05em; margin: 0 0 1.25rem;
  }
</style>
</head>
<body>
  <div class="card">
    <p class="brand">TRADE ANALYST</p>
    <h1>השירות אינו זמין באזורך</h1>
    <p>Trade Analyst זמין כרגע למשתמשים בישראל בלבד. אם אתה מחוץ לישראל באופן זמני, פנה אלינו ונשמח לסייע.</p>
  </div>
</body>
</html>`;
}
