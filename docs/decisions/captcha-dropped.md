# Decision: CAPTCHA on auth was considered and dropped

**Status:** rejected. Revisit path recorded in
[docs/in-progress/AUTH-HARDENING-GEO-GATE.md](../in-progress/AUTH-HARDENING-GEO-GATE.md).

hCaptcha / Turnstile were evaluated as bot-signup protection and dropped for a concrete
technical reason, not a preference:

Enabling Supabase's project-level CAPTCHA toggle also covers `signInWithPassword`. That would
break the server-side `verifyCurrentPassword` in [lib/auth/reauth.ts](../../lib/auth/reauth.ts),
which is the re-authentication step behind **change-password, change-email and
delete-account**. There is no per-endpoint granularity on that toggle.

So the choice is not "CAPTCHA vs no CAPTCHA" — it's "CAPTCHA vs working account-management
flows". Until Supabase separates the two, this stays off.

Related: [geo-gate.md](geo-gate.md), which was the other anti-bot measure considered in the
same round and is also deliberately off.
