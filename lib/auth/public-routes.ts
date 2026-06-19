// Routes that intentionally do NOT require authentication at the handler level.
// Every other route under app/api/** must call supabase.auth.getUser() first.
// Defence-in-depth: even if proxy.ts auth gating changes (Next upgrade, matcher
// edit), routes here are the ONLY ones that should be reachable anonymously.
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  // Israeli government open data (city list for the address-autocomplete form).
  // No PII; payload is the same for every visitor; caching via Next revalidate.
  "/api/cities",
]);
