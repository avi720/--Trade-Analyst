import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/ibkr/encrypt";
import { fetchFlexQuery } from "@/lib/ibkr/flex-client";

// Tests the Activity Flex Query connection.
// Uses the RLS-bound client to read the caller's own BrokerConnection row.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conn } = await supabase
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
