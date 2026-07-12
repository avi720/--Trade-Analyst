# Base URL — server-side redirect / callback rule

**Never use `new URL(request.url).origin` to build redirect or callback URLs.** `request.url` in server-side handlers may not reflect the real external URL depending on the hosting environment (proxies, Vercel edge, custom domains).

Instead call `getBaseUrl()` from [lib/utils.ts](../../lib/utils.ts). It returns `SITE_URL` (set in the Vercel dashboard) or `http://localhost:3000` locally.

`SITE_URL` is intentionally a **server-only** env var (no `NEXT_PUBLIC_` prefix) — `getBaseUrl()` must never be called from client code.

This rule applies anywhere the server needs to produce a fully-qualified external URL:
- Auth callbacks
- Password-reset links
- OAuth redirects
- Webhook return URLs
- Payment processor callbacks

## Open-redirect guard

When building a URL from a caller-supplied `next` / redirect path parameter, always validate that it starts with `/` before appending it to `getBaseUrl()`. Otherwise a caller can pass an absolute URL to a different origin and turn the callback into an open redirect.
