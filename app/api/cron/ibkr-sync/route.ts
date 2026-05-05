import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/ibkr/encrypt";
import { fetchFlexQuery, IbkrTransientError } from "@/lib/ibkr/flex-client";
import { parseActivityXml } from "@/lib/ibkr/parse-flex-xml";
import { processExecutions } from "@/lib/ibkr/process-executions";

// Secured with CRON_SECRET header — called by Render Cron Job at 13:00 & 20:00 UTC daily
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  // Load the active BrokerConnection (single-user, get the only active one)
  const { data: conn, error: connErr } = await admin
    .from("BrokerConnection")
    .select("id, userId, flexTokenEncrypted, flexQueryIdActivity")
    .eq("isActive", true)
    .maybeSingle();

  if (connErr) {
    console.error("[cron/ibkr-sync] DB error loading connection:", connErr.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!conn) {
    return NextResponse.json({ skipped: true, reason: "No active connection" });
  }

  let syncStatus: "SUCCESS" | "ERROR" = "SUCCESS";
  let syncError: string | null = null;

  try {
    console.log(`[cron/ibkr-sync] Starting. queryId=${conn.flexQueryIdActivity}`);

    const token = decryptToken(conn.flexTokenEncrypted);
    const xml = await fetchFlexQuery(token, conn.flexQueryIdActivity);
    console.log(`[cron/ibkr-sync] fetchFlexQuery complete. xml.length=${xml.length}`);

    // Audit log — store raw XML (capped)
    const { data: event } = await admin.from("BrokerEvent").insert({
      userId: conn.userId,
      source: "IBKR_FLEX",
      eventType: "FLEX_FETCH",
      rawPayload: { xml: xml.slice(0, 10000) },
      processingStatus: "PENDING",
    }).select("id").single();
    console.log(`[cron/ibkr-sync] BrokerEvent inserted: id=${event?.id}`);

    const executions = parseActivityXml(xml);
    console.log(`[cron/ibkr-sync] parseActivityXml: ${executions.length} executions parsed`);

    const results = await processExecutions(executions, conn.userId);

    const failed = results.filter((r) => r.status === "FAILED");
    if (failed.length > 0) {
      syncStatus = "ERROR";
      syncError = `${failed.length} execution(s) failed. First: ${failed[0].error}`;
    }

    // Mark the event as processed
    if (event) {
      await admin.from("BrokerEvent").update({
        processingStatus: syncStatus === "ERROR" ? "ERROR" : "PROCESSED",
        processedAt: new Date().toISOString(),
        processingError: syncError,
      }).eq("id", event.id);
    }

    // Extract accountId from any execution and persist to BrokerConnection
    const accountId = executions[0]?.brokerClientAccountId ?? null;

    console.log(
      `[cron/ibkr-sync] processExecutions complete: ${results.length - failed.length} success, ${failed.length} failed.`,
      results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {} as Record<string, number>)
    );

    // Update sync timestamps + accountId
    await admin
      .from("BrokerConnection")
      .update({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: syncStatus,
        lastSyncError: syncError,
        ...(accountId ? { accountId } : {}),
      })
      .eq("id", conn.id);

    console.log(`[cron/ibkr-sync] Done. lastSyncStatus=${syncStatus}`);
  } catch (err) {
    syncStatus = "ERROR";
    syncError = err instanceof Error ? err.message : String(err);
    console.error("[cron/ibkr-sync] Error:", syncError);

    // Transient IBKR errors (report not ready yet): don't update lastSyncAt so
    // the next cron fire retries without waiting the full polling interval.
    const isTransient = err instanceof IbkrTransientError;
    await admin
      .from("BrokerConnection")
      .update({
        ...(isTransient ? {} : { lastSyncAt: new Date().toISOString() }),
        lastSyncStatus: syncStatus,
        lastSyncError: syncError,
      })
      .eq("id", conn.id);
    return NextResponse.json({ ok: false, status: syncStatus, error: syncError, transient: isTransient });
  }

  return NextResponse.json({ ok: true, status: syncStatus, error: syncError });
}

// Allow POST as well — Render cron may be configured with -X POST
export const POST = GET;
