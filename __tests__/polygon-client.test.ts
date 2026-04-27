import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPrices } from "@/lib/polygon/client";

// Minimal Polygon snapshot response shape
function makeSnapshotResponse(tickers: Array<{ ticker: string; lastTradePrice?: number; dayClose?: number }>) {
  return {
    status: "OK",
    tickers: tickers.map((t) => ({
      ticker: t.ticker,
      lastTrade: t.lastTradePrice !== undefined ? { p: t.lastTradePrice } : undefined,
      day: t.dayClose !== undefined ? { c: t.dayClose } : undefined,
    })),
  };
}

beforeEach(() => {
  vi.stubEnv("POLYGON_API_KEY", "test-key");
  vi.restoreAllMocks();
});

describe("fetchPrices", () => {
  it("returns empty Map without calling fetch when tickers array is empty", async () => {
    const spy = vi.spyOn(global, "fetch");
    const result = await fetchPrices([]);
    expect(result.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns prices for matching tickers using lastTrade.p", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeSnapshotResponse([
            { ticker: "AAPL", lastTradePrice: 175.5 },
            { ticker: "MSFT", lastTradePrice: 420.0 },
            { ticker: "TSLA", lastTradePrice: 200.0 },
          ])
        ),
        { status: 200 }
      )
    );

    const result = await fetchPrices(["AAPL", "MSFT"]);
    expect(result.get("AAPL")).toBe(175.5);
    expect(result.get("MSFT")).toBe(420.0);
    expect(result.has("TSLA")).toBe(false);
  });

  it("falls back to day.c when lastTrade is missing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeSnapshotResponse([{ ticker: "AAPL", dayClose: 174.0 }])
        ),
        { status: 200 }
      )
    );

    const result = await fetchPrices(["AAPL"]);
    expect(result.get("AAPL")).toBe(174.0);
  });

  it("prefers lastTrade.p over day.c when both present", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeSnapshotResponse([{ ticker: "AAPL", lastTradePrice: 175.0, dayClose: 174.0 }])
        ),
        { status: 200 }
      )
    );

    const result = await fetchPrices(["AAPL"]);
    expect(result.get("AAPL")).toBe(175.0);
  });

  it("ticker missing from Polygon response is absent from result (not an error)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify(makeSnapshotResponse([{ ticker: "AAPL", lastTradePrice: 175.0 }])),
        { status: 200 }
      )
    );

    const result = await fetchPrices(["AAPL", "UNKNOWN_TICKER"]);
    expect(result.has("UNKNOWN_TICKER")).toBe(false);
    expect(result.get("AAPL")).toBe(175.0);
  });

  it("returns empty Map on 429 (rate limit) without throwing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Too Many Requests", { status: 429 })
    );

    const result = await fetchPrices(["AAPL"]);
    expect(result.size).toBe(0);
  });

  it("throws on non-OK non-429 response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    await expect(fetchPrices(["AAPL"])).rejects.toThrow("Polygon snapshot failed: 500");
  });

  it("returns empty Map when response has no tickers array", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "OK" }), { status: 200 })
    );

    const result = await fetchPrices(["AAPL"]);
    expect(result.size).toBe(0);
  });

  it("skips tickers with price = 0 or undefined", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "OK",
          tickers: [
            { ticker: "AAPL", lastTrade: { p: 0 } },
            { ticker: "MSFT", day: { c: undefined } },
            { ticker: "TSLA", lastTrade: { p: 300.0 } },
          ],
        }),
        { status: 200 }
      )
    );

    const result = await fetchPrices(["AAPL", "MSFT", "TSLA"]);
    expect(result.has("AAPL")).toBe(false);
    expect(result.has("MSFT")).toBe(false);
    expect(result.get("TSLA")).toBe(300.0);
  });

  it("matches tickers case-insensitively", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify(makeSnapshotResponse([{ ticker: "AAPL", lastTradePrice: 175.0 }])),
        { status: 200 }
      )
    );

    const result = await fetchPrices(["aapl"]);
    expect(result.get("AAPL")).toBe(175.0);
  });

  it("throws when POLYGON_API_KEY is not set", async () => {
    vi.stubEnv("POLYGON_API_KEY", "");
    await expect(fetchPrices(["AAPL"])).rejects.toThrow("POLYGON_API_KEY env var is not set");
  });
});
