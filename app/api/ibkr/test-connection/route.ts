import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/ibkr/encrypt";
import { fetchFlexQuery } from "@/lib/ibkr/flex-client";
import type { Database } from "@/lib/db/types";

interface QueryResult {
  ok: boolean;
  error?: string;
}

// Tests both Flex queries (Query 1 = Trade Confirmations, Query 2 = Activity)
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
    .select("flexTokenEncrypted, flexQueryIdTrades, flexQueryIdActivity")
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

  const [query1, query2] = await Promise.allSettled([
    fetchFlexQuery(token, conn.flexQueryIdTrades),
    fetchFlexQuery(token, conn.flexQueryIdActivity),
  ]);

  const q1Result: QueryResult =
    query1.status === "fulfilled"
      ? { ok: true }
      : { ok: false, error: (query1.reason as Error).message };

  const q2Result: QueryResult =
    query2.status === "fulfilled"
      ? { ok: true }
      : { ok: false, error: (query2.reason as Error).message };

  const bothOk = q1Result.ok && q2Result.ok;

  // If this is the first successful test, flag it so the UI can prompt backfill
  let firstSuccess = false;
  if (bothOk) {
    const { data: existingConn } = await admin
      .from("BrokerConnection")
      .select("lastSyncAt, lastBackfillAt")
      .eq("userId", user.id)
      .maybeSingle();
    if (existingConn && !existingConn.lastSyncAt && !existingConn.lastBackfillAt) {
      firstSuccess = true;
    }
  }

  return NextResponse.json({
    query1: q1Result,
    query2: q2Result,
    firstSuccess,
  });
}
