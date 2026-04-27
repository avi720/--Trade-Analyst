// Shared price-sync logic used by both the cron route and the on-demand refresh endpoint.

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPrices } from "./client";

export interface PriceSyncResult {
  updated: number;
  tickers: string[];
  status: "SUCCESS" | "ERROR";
  error?: string;
}

export async function runPriceSync(userId: string): Promise<PriceSyncResult> {
  const admin = createAdminClient();

  // Fetch distinct tickers of open trades for this user
  const { data: openTrades, error: tradesErr } = await admin
    .from("Trade")
    .select("id, ticker")
    .eq("userId", userId)
    .eq("status", "Open");

  if (tradesErr) {
    throw new Error(`Failed to load open trades: ${tradesErr.message}`);
  }

  if (!openTrades || openTrades.length === 0) {
    return { updated: 0, tickers: [], status: "SUCCESS" };
  }

  const tickers = [...new Set(openTrades.map((t) => t.ticker))];
  const priceMap = await fetchPrices(tickers);

  if (priceMap.size === 0) {
    // Polygon returned nothing (rate limit or no data) — not an error, just 0 updates
    return { updated: 0, tickers, status: "SUCCESS" };
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const trade of openTrades) {
    const price = priceMap.get(trade.ticker.toUpperCase());
    if (price === undefined) continue;

    const { error: updateErr } = await admin
      .from("Trade")
      .update({ lastKnownPrice: price, lastPriceUpdateAt: now })
      .eq("id", trade.id);

    if (updateErr) {
      console.error(`[polygon/sync] Failed to update trade ${trade.id}:`, updateErr.message);
    } else {
      updated++;
    }
  }

  return { updated, tickers, status: "SUCCESS" };
}
