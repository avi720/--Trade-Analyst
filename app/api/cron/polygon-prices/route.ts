import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPriceSync } from "@/lib/polygon/sync";

// Secured with CRON_SECRET header — called by Render Cron Job every 15 minutes.
// Skips internally if pricePollingIntervalMin hasn't elapsed since lastPriceSyncAt.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  const { data: conn, error: connErr } = await admin
    .from("BrokerConnection")
    .select("id, userId, pricePollingIntervalMin, lastPriceSyncAt")
    .eq("isActive", true)
    .maybeSingle();

  if (connErr) {
    console.error("[cron/polygon-prices] DB error loading connection:", connErr.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!conn) {
    return NextResponse.json({ skipped: true, reason: "No active connection" });
  }

  // Skip if not enough time has elapsed since the last price sync
  if (conn.lastPriceSyncAt) {
    const msSince = Date.now() - new Date(conn.lastPriceSyncAt).getTime();
    const intervalMs = conn.pricePollingIntervalMin * 60_000;
    if (msSince < intervalMs) {
      return NextResponse.json({
        skipped: true,
        reason: `Last price sync was ${Math.round(msSince / 60000)}m ago, interval is ${conn.pricePollingIntervalMin}m`,
      });
    }
  }

  let syncStatus: "SUCCESS" | "ERROR" = "SUCCESS";
  let syncError: string | null = null;
  let result = { updated: 0, tickers: [] as string[] };

  try {
    const syncResult = await runPriceSync(conn.userId);
    result = { updated: syncResult.updated, tickers: syncResult.tickers };
    syncStatus = syncResult.status;
    if (syncResult.error) syncError = syncResult.error;

    console.log(`[cron/polygon-prices] Updated ${syncResult.updated} trade(s) across tickers:`, syncResult.tickers);
  } catch (err) {
    syncStatus = "ERROR";
    syncError = err instanceof Error ? err.message : String(err);
    console.error("[cron/polygon-prices] Error:", syncError);
  }

  // Always update the sync timestamp so the interval check works next run
  await admin
    .from("BrokerConnection")
    .update({
      lastPriceSyncAt: new Date().toISOString(),
      lastPriceSyncStatus: syncStatus,
    })
    .eq("id", conn.id);

  return NextResponse.json({ ok: true, status: syncStatus, error: syncError, ...result });
}
