/**
 * Plan limits that both server routes and client components read.
 *
 * Kept free of any import so it is safe in a browser bundle — `tier.ts`
 * pulls in the service-role Supabase client and must stay server-only, but
 * marketing copy ("עד N הודעות ביום") has to quote the same numbers the
 * route enforces. Change a limit here and every surface follows.
 */

// Chat (חנן) caps — enforced in POST /api/chat via `checkRateLimit`, which is a
// rolling fixed window from the first message, not a calendar day. The hourly
// bucket applies to both tiers (Gemini cost protection); the daily buckets are
// per tier.
export const CHAT_HOURLY_LIMIT = 30
export const CHAT_DAILY_LIMIT_FREE = 3
export const CHAT_DAILY_LIMIT_PRO = 100
