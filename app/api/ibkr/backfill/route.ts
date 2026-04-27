import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/ibkr/encrypt";
import { fetchFlexQuery } from "@/lib/ibkr/flex-client";
import { parseActivityXml } from "@/lib/ibkr/parse-flex-xml";
import { processExecutions } from "@/lib/ibkr/process-executions";
import type { Database } from "@/lib/db/types";

// POST — trigger async Activity backfill (Query 2)
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
    .select("id, flexTokenEncrypted, flexQueryIdActivity, lastBackfillStatus")
    .eq("userId", user.id)
    .maybeSingle();

  if (!conn) return NextResponse.json({ error: "No connection configured" }, { status: 404 });
  if (conn.lastBackfillStatus === "RUNNING") {
    return NextResponse.json({ error: "Backfill is already running" }, { status: 409 });
  }

  // Mark as RUNNING immediately before returning
  await admin
    .from("BrokerConnection")
    .update({ lastBackfillStatus: "RUNNING", lastBackfillError: null })
    .eq("userId", user.id);

  const userId = user.id;

  // Fire-and-forget — runs after response is sent (works on Render persistent Node process)
  setImmediate(async () => {
    const adminBg = createAdminClient();
    try {
      const token = decryptToken(conn.flexTokenEncrypted);
      const xml = await fetchFlexQuery(token, conn.flexQueryIdActivity);

      // Log raw event for audit
      await adminBg.from("BrokerEvent").insert({
        userId,
        source: "IBKR_FLEX",
        eventType: "BACKFILL_CHUNK",
        rawPayload: { xml: xml.slice(0, 10000) }, // cap to avoid huge JSON storage
        processingStatus: "PENDING",
      });

      const executions = parseActivityXml(xml);
      await processExecutions(executions, userId);

      await adminBg
        .from("BrokerConnection")
        .update({
          lastBackfillAt: new Date().toISOString(),
          lastBackfillStatus: "SUCCESS",
          lastBackfillError: null,
        })
        .eq("userId", userId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api/ibkr/backfill] Background backfill failed:", msg);
      await adminBg
        .from("BrokerConnection")
        .update({
          lastBackfillStatus: "ERROR",
          lastBackfillError: msg,
        })
        .eq("userId", userId);
    }
  });

  return NextResponse.json({ status: "started" }, { status: 202 });
}

// GET — return current backfill status (polled by settings UI while running)
export async function GET() {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("BrokerConnection")
    .select("lastBackfillAt, lastBackfillStatus, lastBackfillError")
    .eq("userId", user.id)
    .maybeSingle();

  return NextResponse.json({
    status: data?.lastBackfillStatus ?? null,
    lastBackfillAt: data?.lastBackfillAt ?? null,
    error: data?.lastBackfillError ?? null,
  });
}
