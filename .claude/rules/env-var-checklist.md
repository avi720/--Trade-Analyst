# Adding a new env var — checklist

When adding a new environment variable to the app:

1. **Add the name** (with a stub value or comment) to [.env.example](../../.env.example). Never commit real secrets.
2. **Document the purpose** in the env-vars table inside [CLAUDE.md](../../CLAUDE.md).
3. **Pick the right prefix:**
   - `NEXT_PUBLIC_*` if and only if the value must be reachable from client bundles. See [client-env-vars.md](client-env-vars.md).
   - No prefix otherwise — server-only.
4. **Set it in the Vercel dashboard** (Production + Preview + Development as appropriate) before the change ships.
5. **Reference it from a server-only module** unless the prefix is `NEXT_PUBLIC_*`.

## Why the .env.example update matters

`.env.example` is the source of truth new developers copy from when onboarding, and it's also what CI setup scripts compare against. Silently adding a new required var without updating the example produces cryptic runtime failures on fresh clones.
