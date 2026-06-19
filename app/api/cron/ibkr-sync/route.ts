import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/ibkr/encrypt";
import { fetchFlexQuery, IbkrTransientError } from "@/lib/ibkr/flex-client";
import { parseActivityXml } from "@/lib/ibkr/parse-flex-xml";
import { processExecutions } from "@/lib/ibkr/process-executions";
import { verifyCronSecret } from "@/lib/auth/cron-secret";
import { redactUserId } from "@/lib/log/redact";
import type { Database } from "@/lib/db/types";

type Admin = SupabaseClient<Database>;

export const maxDuration = 60;

interface ConnectionRow {
  id: string;
  userId: string;
  flexTokenEncrypted: string;
  flexQueryIdActivity: string;
}

interface ConnectionResult {
  connectionId: string;
  userId: string;
  status: "SUCCESS" | "ERROR" | "TRANSIENT_ERROR";
  error: string | null;
  executions: number;
  failedExecutions: number;
}

async function syncOneConnection(admin: Admin, conn: ConnectionRow): Promise<ConnectionResult> {
  let syncStatus: "SUCCESS" | "ERROR" = "SUCCESS";
  let syncError: string | null = null;
  let executions = 0;
  let failedExecutions = 0;

  try {
    console.log(`[cron/ibkr-sync] user=${redactUserId(conn.userId)} queryId=${conn.flexQueryIdActivity} starting`);

    const token = decryptToken(conn.flexTokenEncrypted);
    const xml = await fetchFlexQuery(token, conn.flexQueryIdActivity);
    console.log(`[cron/ibkr-sync] user=${redactUserId(conn.userId)} fetchFlexQuery complete. xml.length=${xml.length}`);

    // Audit log — store raw XML (capped)
    const { data: event } = await admin.from("BrokerEvent").insert({
      userId: conn.userId,
      source: "IBKR_FLEX",
      eventType: "FLEX_FETCH",
      rawPayload: { xml: xml.slice(0, 10000) },
      processingStatus: "PENDING",
    }).select("id").single();

    const parsed = parseActivityXml(xml);
    executions = parsed.length;
    console.log(`[cron/ibkr-sync] user=${redactUserId(conn.userId)} parseActivityXml: ${executions} executions`);

    const results = await processExecutions(parsed, conn.userId);

    const failed = results.filter((r) => r.status === "FAILED");
    failedExecutions = failed.length;
    if (failed.length > 0) {
      syncStatus = "ERROR";
      syncError = `${failed.length} execution(s) failed. First: ${failed[0].error}`;
    }

    if (event) {
      await admin.from("BrokerEvent").update({
        processingStatus: syncStatus === "ERROR" ? "ERROR" : "PROCESSED",
        processedAt: new Date().toISOString(),
        processingError: syncError,
      }).eq("id", event.id);
    }

    const accountId = parsed[0]?.brokerClientAccountId ?? null;

    console.log(
      `[cron/ibkr-sync] user=${redactUserId(conn.userId)} complete: ${results.length - failed.length} success, ${failed.length} failed`
    );

    await admin
      .from("BrokerConnection")
      .update({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: syncStatus,
        lastSyncError: syncError,
        ...(accountId ? { accountId } : {}),
      })
      .eq("id", conn.id);

    return {
      connectionId: conn.id,
      userId: conn.userId,
      status: syncStatus,
      error: syncError,
      executions,
      failedExecutions,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[cron/ibkr-sync] user=${redactUserId(conn.userId)} error:`, errMsg);

    // Transient IBKR errors (report not ready yet): don't update lastSyncAt so
    // the next cron fire retries without waiting the full polling interval.
    const isTransient = err instanceof IbkrTransientError;
    await admin
      .from("BrokerConnection")
      .update({
        ...(isTransient ? {} : { lastSyncAt: new Date().toISOString() }),
        lastSyncStatus: "ERROR",
        lastSyncError: errMsg,
      })
      .eq("id", conn.id);

    return {
      connectionId: conn.id,
      userId: conn.userId,
      status: isTransient ? "TRANSIENT_ERROR" : "ERROR",
      error: errMsg,
      executions,
      failedExecutions,
    };
  }
}

// Secured with CRON_SECRET header — called by GitHub Actions at 13:00 & 20:00 UTC daily.
// Iterates ALL active BrokerConnections; one failed connection does not block the others.
export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get("Authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  const { data: conns, error: connErr } = await admin
    .from("BrokerConnection")
    .select("id, userId, flexTokenEncrypted, flexQueryIdActivity")
    .eq("isActive", true);

  if (connErr) {
    console.error("[cron/ibkr-sync] DB error loading connections:", connErr.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!conns || conns.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No active connections", processed: 0 });
  }

  console.log(`[cron/ibkr-sync] processing ${conns.length} active connection(s)`);

  // Sequential, not parallel: IBKR rate-limits per-token and we already have a
  // 60s maxDuration cap. Sequential keeps the loop predictable and lets each
  // connection's error surface independently in logs.
  const results: ConnectionResult[] = [];
  for (const conn of conns as ConnectionRow[]) {
    results.push(await syncOneConnection(admin, conn));
  }

  const success = results.filter((r) => r.status === "SUCCESS").length;
  const errored = results.filter((r) => r.status === "ERROR").length;
  const transient = results.filter((r) => r.status === "TRANSIENT_ERROR").length;

  return NextResponse.json({
    ok: errored === 0,
    total: results.length,
    success,
    errored,
    transient,
    results,
  });
}

