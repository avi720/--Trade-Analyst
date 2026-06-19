import { createHmac } from "crypto";

// Returns a short, stable, non-reversible tag for a user id, suitable for log
// statements where the raw UUID adds no debug value. Reuses
// FLEX_TOKEN_ENCRYPTION_KEY as the HMAC key — no new secret to manage; the
// derived value is non-reversible without access to the same env var.
export function redactUserId(id: string | null | undefined): string {
  if (!id) return "anon";
  const key = process.env.FLEX_TOKEN_ENCRYPTION_KEY;
  if (!key) return id.slice(0, 8); // best-effort fallback; doesn't leak full id
  return createHmac("sha256", key).update(id).digest("hex").slice(0, 8);
}
