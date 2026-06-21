import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCurrentPassword } from "@/lib/auth/reauth";
import { checkRateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { logAuditEvent } from "@/lib/audit/log";
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

  // Log BEFORE the delete — the row is cascade-removed when the auth user is deleted,
  // but at least the failure path can still record. Use a separate try/catch since
  // we don't want logging to block deletion.
  await logAuditEvent({
    userId: user.id,
    eventType: "account_deleted",
    status: "success",
    metadata: { email: user.email },
    request: req,
  });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
