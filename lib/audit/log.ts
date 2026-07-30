import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";

// Mirrors the audit_event_type_check CHECK constraint on public."AuditEvent" — adding a
// value here without the matching migration makes the insert fail.
export type AuditEventType =
  | "password_changed"
  | "email_changed"
  | "account_deleted"
  | "reauth_failed"
  | "rate_limit_hit"
  | "tier_upgraded"
  | "tier_downgraded"
  | "subscription_updated"
  | "subscription_orphaned" // X14 — webhook fired for a user_id with no matching User row
  | "signup_completed"
  | "oauth_callback_failed"
  | "auth_callback_no_code";

export type AuditStatus = "success" | "failure";

interface AuditContext {
  /**
   * NULL for events that happen before the public."User" row exists — the column has an FK
   * to User(id), so an auth uid with no app row would violate it. Auth-path callers pass
   * null and carry the uid in `metadata` instead.
   */
  userId: string | null;
  eventType: AuditEventType;
  status: AuditStatus;
  metadata?: Record<string, unknown>;
  request?: { headers: Headers };
}

// Truncates an IP for privacy: IPv4 -> /24 (last octet zeroed); IPv6 -> first 4 groups.
function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    const parts = trimmed.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (trimmed.includes(":")) {
    const groups = trimmed.split(":").filter(Boolean);
    return groups.slice(0, 4).join(":") + "::";
  }
  return null;
}

function extractClientIp(headers: Headers): string | null {
  // Vercel: x-forwarded-for is "client, proxy1, proxy2..."; first is the original client.
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip");
}

// Fire-and-forget: never throws, never blocks the calling handler.
// Logs to console if the insert fails so the failure is observable, but the
// route never fails because of an audit-write error.
export async function logAuditEvent(ctx: AuditContext): Promise<void> {
  try {
    const admin = createAdminClient();
    const ip = ctx.request ? truncateIp(extractClientIp(ctx.request.headers)) : null;
    const userAgent = ctx.request?.headers.get("user-agent") ?? null;

    // Country rides in metadata for every event type, not just the auth ones — Vercel
    // already attaches the header, so this is a free geo dimension on the whole audit
    // trail. Null off-Vercel (localhost) and 'XX' when Vercel cannot resolve it.
    const country = ctx.request?.headers.get("x-vercel-ip-country") ?? null;
    const metadata =
      country !== null
        ? { ...(ctx.metadata ?? {}), country }
        : (ctx.metadata ?? null);

    const { error } = await admin.from("AuditEvent").insert({
      userId: ctx.userId,
      eventType: ctx.eventType,
      status: ctx.status,
      metadata: metadata as Json | null,
      ipAddress: ip,
      userAgent: userAgent?.slice(0, 500) ?? null,
    });

    if (error) {
      console.error("[audit] insert failed:", error.message, "event:", ctx.eventType);
    }
  } catch (err) {
    console.error("[audit] logging threw:", err instanceof Error ? err.message : err);
  }
}
