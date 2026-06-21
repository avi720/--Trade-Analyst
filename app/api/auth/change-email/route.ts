import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCurrentPassword } from "@/lib/auth/reauth";
import { checkRateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { logAuditEvent } from "@/lib/audit/log";
import type { Database } from "@/lib/db/types";

const schema = z.object({
  currentPassword: z.string().min(1, "יש להזין את הסיסמה הנוכחית"),
  newEmail: z.string().email("כתובת אימייל לא תקינה"),
});

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 5 attempts per 10 minutes per user.
  const rl = await checkRateLimit(`user:${user.id}:change-email`, 5, 600);
  if (!rl.ok) {
    await logAuditEvent({
      userId: user.id,
      eventType: "rate_limit_hit",
      status: "failure",
      metadata: { action: "change-email" },
      request: req,
    });
    return rateLimitedResponse(rl);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "נתונים לא תקינים";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const { currentPassword, newEmail } = parsed.data;

  const ok = await verifyCurrentPassword(user.email, currentPassword);
  if (!ok) {
    await logAuditEvent({
      userId: user.id,
      eventType: "reauth_failed",
      status: "failure",
      metadata: { action: "change-email" },
      request: req,
    });
    return NextResponse.json({ error: "הסיסמה הנוכחית שגויה" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, { email: newEmail });
  if (error) {
    await logAuditEvent({
      userId: user.id,
      eventType: "email_changed",
      status: "failure",
      metadata: { oldEmail: user.email, newEmail, error: error.message },
      request: req,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("User").update({ email: newEmail }).eq("id", user.id);

  await logAuditEvent({
    userId: user.id,
    eventType: "email_changed",
    status: "success",
    metadata: { oldEmail: user.email, newEmail },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
