import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/ibkr/encrypt";
import { fetchFlexQuery } from "@/lib/ibkr/flex-client";
import type { Database } from "@/lib/db/types";

// Tests the Activity Flex Query connection
export async function POST() {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("BrokerConnection")
    .select("flexTokenEncrypted, flexQueryIdActivity")
    .eq("userId", user.id)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ error: "No connection configured" }, { status: 404 });
  }

  let token: string;
  try {
    token = decryptToken(conn.flexTokenEncrypted);
  } catch {
    return NextResponse.json({ error: "Failed to decrypt token — check server configuration" }, { status: 500 });
  }

  let activityOk = true;
  let activityError: string | undefined;

  try {
    await fetchFlexQuery(token, conn.flexQueryIdActivity);
  } catch (err) {
    activityOk = false;
    activityError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    activity: { ok: activityOk, error: activityError },
  });
}
