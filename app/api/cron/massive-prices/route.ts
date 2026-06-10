import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPriceSync } from "@/lib/massive/sync";
import type { Database } from "@/lib/db/types";

type Admin = SupabaseClient<Database>;

interface ConnectionRow {
  id: string;
  userId: string;
  pricePollingIntervalMin: number;
  lastPriceSyncAt: string | null;
}

interface ConnectionResult {
  connectionId: string;
  userId: string;
  status: "SUCCESS" | "ERROR" | "SKIPPED";
  reason?: string;
  error: string | null;
  updated: number;
  tickers: string[];
}

async function syncOneConnection(admin: Admin, conn: ConnectionRow): Promise<ConnectionResult> {
  // Skip if not enough time has elapsed since the last price sync for this user
  if (conn.lastPriceSyncAt) {
    const msSince = Date.now() - new Date(conn.lastPriceSyncAt).getTime();
    const intervalMs = conn.pricePollingIntervalMin * 60_000;
    if (msSince < intervalMs) {
      return {
        connectionId: conn.id,
        userId: conn.userId,
        status: "SKIPPED",
        reason: `Last price sync was ${Math.round(msSince / 60000)}m ago, interval is ${conn.pricePollingIntervalMin}m`,
        error: null,
        updated: 0,
        tickers: [],
      };
    }
  }

  let syncStatus: "SUCCESS" | "ERROR" = "SUCCESS";
  let syncError: string | null = null;
  let updated = 0;
  let tickers: string[] = [];

  try {
    const syncResult = await runPriceSync(conn.userId);
    updated = syncResult.updated;
    tickers = syncResult.tickers;
    syncStatus = syncResult.status;
    if (syncResult.error) syncError = syncResult.error;

    console.log(`[cron/massive-prices] user=${conn.userId} updated ${updated} trade(s):`, tickers);
  } catch (err) {
    syncStatus = "ERROR";
    syncError = err instanceof Error ? err.message : String(err);
    console.error(`[cron/massive-prices] user=${conn.userId} error:`, syncError);
  }

  // Always update the sync timestamp so the interval check works next run
  await admin
    .from("BrokerConnection")
    .update({
      lastPriceSyncAt: new Date().toISOString(),
      lastPriceSyncStatus: syncStatus,
    })
    .eq("id", conn.id);

  return {
    connectionId: conn.id,
    userId: conn.userId,
    status: syncStatus,
    error: syncError,
    updated,
    tickers,
  };
}

// Secured with CRON_SECRET header — called by GitHub Actions (currently disabled).
// Iterates ALL active BrokerConnections; each user's polling interval is honoured per-row.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  const { data: conns, error: connErr } = await admin
    .from("BrokerConnection")
    .select("id, userId, pricePollingIntervalMin, lastPriceSyncAt")
    .eq("isActive", true);

  if (connErr) {
    console.error("[cron/massive-prices] DB error loading connections:", connErr.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!conns || conns.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No active connections", processed: 0 });
  }

  console.log(`[cron/massive-prices] processing ${conns.length} active connection(s)`);

  const results: ConnectionResult[] = [];
  for (const conn of conns as ConnectionRow[]) {
    results.push(await syncOneConnection(admin, conn));
  }

  const success = results.filter((r) => r.status === "SUCCESS").length;
  const errored = results.filter((r) => r.status === "ERROR").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;

  return NextResponse.json({
    ok: errored === 0,
    total: results.length,
    success,
    errored,
    skipped,
    results,
  });
}
