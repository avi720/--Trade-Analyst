// Massive snapshot client — fetches last known prices for US equities.
// Uses the all-tickers snapshot endpoint (one HTTP call per cron run).
// Free tier: 5 calls/min, 15 min delayed data.

const MASSIVE_SNAPSHOT_URL =
  "https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers";

interface MassiveTicker {
  ticker: string;
  lastTrade?: { p?: number };
  day?: { c?: number };
}

interface MassiveSnapshotResponse {
  status: string;
  tickers?: MassiveTicker[];
}

// Returns a Map<ticker, lastPrice> for the requested tickers.
// Uses lastTrade.p; falls back to day.c if lastTrade is unavailable.
// On 429: logs a warning and returns empty Map (caller retries next interval).
// On other non-OK responses: throws so the caller can log the error.
export async function fetchPrices(tickers: string[]): Promise<Map<string, number>> {
  if (tickers.length === 0) return new Map();

  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) throw new Error("MASSIVE_API_KEY env var is not set");

  const url = `${MASSIVE_SNAPSHOT_URL}?apiKey=${apiKey}`;
  const res = await fetch(url);

  if (res.status === 429) {
    console.warn("[massive/client] Rate limited (429). Will retry next interval.");
    return new Map();
  }

  if (!res.ok) {
    throw new Error(`Massive snapshot failed: ${res.status} ${res.statusText}`);
  }

  const data: MassiveSnapshotResponse = await res.json();
  if (!data.tickers) return new Map();

  const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
  const priceMap = new Map<string, number>();

  for (const entry of data.tickers) {
    if (!tickerSet.has(entry.ticker)) continue;
    const price = entry.lastTrade?.p ?? entry.day?.c;
    if (price !== undefined && price > 0) {
      priceMap.set(entry.ticker, price);
    }
  }

  return priceMap;
}
