import { timingSafeEqual } from "crypto";

// Constant-time check of a "Bearer <token>" header against CRON_SECRET.
// Returns true only when the header matches exactly.
export function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;

  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
