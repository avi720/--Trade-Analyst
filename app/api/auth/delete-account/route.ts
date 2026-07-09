import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCurrentPassword } from "@/lib/auth/reauth";
import { checkRateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { logAuditEvent } from "@/lib/audit/log";
import { cancelSubscription, getLemonSqueezyConfig } from "@/lib/billing/lemon-squeezy";
import type { Database } from "@/lib/db/types";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 3 attempts per 10 minutes per user.
  const rl = await checkRateLimit(`user:${user.id}:delete-account`, 3, 600);
  if (!rl.ok) {
    await logAuditEvent({
      userId: user.id,
      eventType: "rate_limit_hit",
      status: "failure",
      metadata: { action: "delete-account" },
      request: req,
    });
    return rateLimitedResponse(rl);
  }

  const { currentPassword } = await req.json().catch(() => ({}));
  if (!currentPassword || typeof currentPassword !== "string") {
    return NextResponse.json({ error: "יש להזין את הסיסמה הנוכחית" }, { status: 400 });
  }

  const ok = await verifyCurrentPassword(user.email, currentPassword);
  if (!ok) {
    await logAuditEvent({
      userId: user.id,
      eventType: "reauth_failed",
      status: "failure",
      metadata: { action: "delete-account" },
      request: req,
    });
    return NextResponse.json({ error: "הסיסמה הנוכחית שגויה" }, { status: 401 });
  }

  const admin = createAdminClient();

  // X21: cancel the Lemon Squeezy subscription BEFORE we delete the app row.
  // Keeping the LS subscription alive after account deletion would keep
  // charging a user whose account no longer exists in our DB. If LS returns
  // a non-2xx (network flake, already-cancelled, unknown subscription id),
  // account deletion still proceeds — the user gets a warning in the response
  // so they can act. Never block deletion on this call.
  let lsCancelled: boolean | null = null;
  let lsCancelWarning: string | null = null;

  const { data: userRow } = await admin
    .from("User")
    .select("lemonsqueezySubscriptionId")
    .eq("id", user.id)
    .maybeSingle();

  const lsSubscriptionId = userRow?.lemonsqueezySubscriptionId ?? null;
  if (lsSubscriptionId) {
    const config = getLemonSqueezyConfig();
    if (config) {
      const result = await cancelSubscription(config, lsSubscriptionId);
      if (result.ok) {
        lsCancelled = true;
      } else {
        lsCancelled = false;
        lsCancelWarning =
          "לא הצלחנו לבטל אוטומטית את המנוי ב-Lemon Squeezy. עבור לפורטל הלקוחות של Lemon Squeezy כדי לבטל ידנית.";
        console.error(
          "[delete-account] LS cancel failed:",
          result.status,
          result.body,
          "subscriptionId:",
          lsSubscriptionId,
        );
      }
    } else {
      // Billing not configured (dev/local) — the subscription exists on LS but
      // we can't reach the API. Surface as a warning; don't block deletion.
      lsCancelled = false;
      lsCancelWarning = "מנוי Lemon Squeezy קיים אך ה-API לא מוגדר בסביבה זו.";
    }
  }

  // Log BEFORE the delete. The AuditEvent.userId FK is ON DELETE SET NULL (see
  // migration 20260709_audit_event_userid_on_delete_set_null), so the audit row
  // survives with metadata.email intact after the User is removed. Logging is
  // still fire-and-forget — a write failure must not block deletion.
  await logAuditEvent({
    userId: user.id,
    eventType: "account_deleted",
    status: "success",
    metadata: {
      email: user.email,
      lsSubscriptionId,
      lsCancelled, // true | false | null (null = no LS subscription attached)
    },
    request: req,
  });

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, lsCancelled, lsCancelWarning });
}
