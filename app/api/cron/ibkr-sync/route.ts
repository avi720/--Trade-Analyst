import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/ibkr/encrypt";
import { fetchFlexQuery } from "@/lib/ibkr/flex-client";
import { parseTradeConfirmXml } from "@/lib/ibkr/parse-flex-xml";
import { processExecutions } from "@/lib/ibkr/process-executions";

// Secured with CRON_SECRET header — called by Render Cron Job every 15 minutes
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  // Load the active BrokerConnection (single-user, get the only active one)
  const { data: conn, error: connErr } = await admin
    .from("BrokerConnection")
    .select(
      "id, userId, flexTokenEncrypted, flexQueryIdTrades, pollingIntervalMin, lastSyncAt"
    )
    .eq("isActive", true)
    .maybeSingle();

  if (connErr) {
    console.error("[cron/ibkr-sync] DB error loading connection:", connErr.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!conn) {
    return NextResponse.json({ skipped: true, reason: "No active connection" });
  }

  // Skip if not enough time has passed since last sync
  if (conn.lastSyncAt) {
    const msSinceSync = Date.now() - new Date(conn.lastSyncAt).getTime();
    const intervalMs = conn.pollingIntervalMin * 60 * 1000;
    if (msSinceSync < intervalMs) {
      return NextResponse.json({
        skipped: true,
        reason: `Last sync was ${Math.round(msSinceSync / 60000)}m ago, interval is ${conn.pollingIntervalMin}m`,
      });
    }
  }

  let syncStatus: "SUCCESS" | "ERROR" = "SUCCESS";
  let syncError: string | null = null;

  try {
    const token = decryptToken(conn.flexTokenEncrypted);
    const xml = await fetchFlexQuery(token, conn.flexQueryIdTrades);

    // Audit log — store raw XML (capped)
    await admin.from("BrokerEvent").insert({
      userId: conn.userId,
      source: "IBKR_FLEX",
      eventType: "FLEX_FETCH",
      rawPayload: { xml: xml.slice(0, 10000) },
      processingStatus: "PENDING",
    });

    const executions = parseTradeConfirmXml(xml);
    const results = await processExecutions(executions, conn.userId);

    const failed = results.filter((r) => r.status === "FAILED");
    if (failed.length > 0) {
      syncStatus = "ERROR";
      syncError = `${failed.length} execution(s) failed. First: ${failed[0].error}`;
    }

    console.log(
      `[cron/ibkr-sync] Processed ${executions.length} executions.`,
      results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {} as Record<string, number>)
    );
  } catch (err) {
    syncStatus = "ERROR";
    syncError = err instanceof Error ? err.message : String(err);
    console.error("[cron/ibkr-sync] Error:", syncError);
  }

  // Update sync timestamps
  await admin
    .from("BrokerConnection")
    .update({
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: syncStatus,
      lastSyncError: syncError,
    })
    .eq("id", conn.id);

  return NextResponse.json({ ok: true, status: syncStatus, error: syncError });
}
