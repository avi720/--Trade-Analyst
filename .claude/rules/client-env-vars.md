# Client-bundle env var rule

Only `NEXT_PUBLIC_*` env vars may be referenced from client-side files — anything under a `"use client"` boundary or transitively imported into one.

Non-prefixed vars evaluate to `undefined` in client bundles — Next.js does not inline them. Referencing them from a client component is a code smell that:
- Silently breaks the feature that depended on the value.
- Can leak the *name* of a server secret into a Sentry-uploaded source map.

## Enforcement

```bash
grep -rn "process.env" app/ components/ lib/ | grep -v NEXT_PUBLIC_
```

Every hit must be in a **server-only** file:
- Route handler (`app/api/**/route.ts`)
- `lib/supabase/admin.ts`
- `lib/billing/*` server helpers
- `sentry.*.config.ts`, `instrumentation*.ts`
- Any `lib/**/*` module never imported from a `"use client"` component
