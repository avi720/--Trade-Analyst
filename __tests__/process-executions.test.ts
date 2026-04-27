/**
 * Unit tests for processExecutions pipeline.
 * Mocks the Supabase admin client — no real DB calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NormalizedExecution } from "../types/trade";

// Mock the admin client module before importing the pipeline
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

// Import after mocks are set up
const { processExecutions } = await import("../lib/ibkr/process-executions");

// --- Helpers ---

const USER_ID = "user-123";
const TRADE_ID = "trade-abc";

function makeExec(overrides: Partial<NormalizedExecution> = {}): NormalizedExecution {
  return {
    brokerExecId: "EXEC001",
    ticker: "AAPL",
    assetClass: "STK",
    side: "BUY",
    quantity: 100,
    price: 175.5,
    commission: 1.5,
    executedAt: new Date("2026-04-23T14:30:00Z"),
    rawPayload: {},
    ...overrides,
  };
}

// Chainable mock for Supabase query builder
function makeQueryChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processExecutions — OPEN", () => {
  it("inserts a new Trade and Order when no open trade exists", async () => {
    const dupCheckChain = makeQueryChain({ data: null, error: null });
    const openTradeChain = makeQueryChain({ data: null, error: null });
    const insertTradeChain = { insert: vi.fn().mockResolvedValue({ error: null }) };
    const insertOrderChain = { insert: vi.fn().mockResolvedValue({ error: null }) };

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "Order" && callCount === 0) { callCount++; return dupCheckChain; }
      if (table === "Trade" && callCount === 1) { callCount++; return openTradeChain; }
      if (table === "Trade" && callCount === 2) { callCount++; return insertTradeChain; }
      if (table === "Order" && callCount === 3) { callCount++; return insertOrderChain; }
      return makeQueryChain({ data: null, error: null });
    });

    const results = await processExecutions([makeExec()], USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("PROCESSED");
    expect(insertTradeChain.insert).toHaveBeenCalledOnce();
    expect(insertOrderChain.insert).toHaveBeenCalledOnce();

    const tradeArg = insertTradeChain.insert.mock.calls[0][0];
    expect(tradeArg.ticker).toBe("AAPL");
    expect(tradeArg.direction).toBe("Long");
    expect(tradeArg.status).toBe("Open");
    expect(tradeArg.userId).toBe(USER_ID);
  });
});

describe("processExecutions — SKIPPED_DUPLICATE", () => {
  it("skips execution when brokerExecId already exists in Order table", async () => {
    const dupCheckChain = makeQueryChain({ data: { id: "existing-order" }, error: null });

    mockFrom.mockImplementation(() => dupCheckChain);

    const results = await processExecutions([makeExec()], USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("SKIPPED_DUPLICATE");
    // Only the dup-check query should have run
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});

describe("processExecutions — REJECTED_NON_STOCK", () => {
  it("rejects non-STK execution without any DB write", async () => {
    const dupCheckChain = makeQueryChain({ data: null, error: null });

    mockFrom.mockImplementation(() => dupCheckChain);

    const results = await processExecutions(
      [makeExec({ assetClass: "OPT" })],
      USER_ID
    );

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("REJECTED_NON_STOCK");
    // Only dup-check ran, no Trade lookup or inserts
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});

describe("processExecutions — CLOSE", () => {
  it("updates Trade to Closed status and inserts Order", async () => {
    const dupCheckChain = makeQueryChain({ data: null, error: null });
    const openTradeData = {
      id: TRADE_ID,
      direction: "Long",
      avgEntryPrice: 175.5,
      totalQuantity: 100,
      totalQuantityOpened: 100,
      totalCommission: 1.5,
      realizedPnl: 0,
      openedAt: "2026-04-23T14:30:00Z",
      stopPrice: 170.0,
    };
    const openTradeChain = makeQueryChain({ data: openTradeData, error: null });
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const insertOrderChain = { insert: vi.fn().mockResolvedValue({ error: null }) };

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "Order" && callCount === 0) { callCount++; return dupCheckChain; }
      if (table === "Trade" && callCount === 1) { callCount++; return openTradeChain; }
      if (table === "Trade" && callCount === 2) { callCount++; return updateChain; }
      if (table === "Order" && callCount === 3) { callCount++; return insertOrderChain; }
      return makeQueryChain({ data: null, error: null });
    });

    // SELL 100 shares of 100 open = CLOSE
    const results = await processExecutions(
      [makeExec({ side: "SELL", brokerExecId: "EXEC_CLOSE" })],
      USER_ID
    );

    expect(results[0].status).toBe("PROCESSED");
    expect(updateChain.update).toHaveBeenCalledOnce();
    const updateArg = updateChain.update.mock.calls[0][0];
    expect(updateArg.status).toBe("Closed");
    expect(insertOrderChain.insert).toHaveBeenCalledOnce();
  });
});

describe("processExecutions — REVERSAL", () => {
  it("calls rpc('reverse_position') for a Long→Short reversal", async () => {
    const dupCheckChain = makeQueryChain({ data: null, error: null });
    // Open trade with 100 Long shares
    const openTradeData = {
      id: TRADE_ID,
      direction: "Long",
      avgEntryPrice: 175.5,
      totalQuantity: 100,
      totalQuantityOpened: 100,
      totalCommission: 1.5,
      realizedPnl: 0,
      openedAt: "2026-04-23T14:30:00Z",
      stopPrice: 170.0,
    };
    const openTradeChain = makeQueryChain({ data: openTradeData, error: null });
    mockRpc.mockResolvedValue({ error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "Order" && callCount === 0) { callCount++; return dupCheckChain; }
      if (table === "Trade" && callCount === 1) { callCount++; return openTradeChain; }
      return makeQueryChain({ data: null, error: null });
    });

    // SELL 200 shares when only 100 are open → REVERSAL (close 100 long + open 100 short)
    const results = await processExecutions(
      [makeExec({ side: "SELL", quantity: 200, brokerExecId: "EXEC_REV" })],
      USER_ID
    );

    expect(results[0].status).toBe("PROCESSED");
    expect(mockRpc).toHaveBeenCalledWith(
      "reverse_position",
      expect.objectContaining({
        p_close_trade_id: TRADE_ID,
        p_close_status: "Closed",
      })
    );
    // RPC receives full Trade and Order JSON objects
    const rpcArg = mockRpc.mock.calls[0][1];
    expect(rpcArg.p_new_trade).toBeDefined();
    expect(rpcArg.p_close_order).toBeDefined();
    expect(rpcArg.p_new_order).toBeDefined();
  });
});

describe("processExecutions — error handling", () => {
  it("marks execution as FAILED when DB insert throws", async () => {
    const dupCheckChain = makeQueryChain({ data: null, error: null });
    const openTradeChain = makeQueryChain({ data: null, error: null });
    const insertTradeChain = {
      insert: vi.fn().mockResolvedValue({ error: { message: "DB constraint violation" } }),
    };

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "Order" && callCount === 0) { callCount++; return dupCheckChain; }
      if (table === "Trade" && callCount === 1) { callCount++; return openTradeChain; }
      if (table === "Trade" && callCount === 2) { callCount++; return insertTradeChain; }
      return makeQueryChain({ data: null, error: null });
    });

    const results = await processExecutions([makeExec()], USER_ID);

    expect(results[0].status).toBe("FAILED");
    expect(results[0].error).toContain("DB constraint violation");
  });

  it("processes multiple executions independently — one failure doesn't stop others", async () => {
    // First exec: duplicate → skip
    // Second exec: valid → OPEN
    const firstDupChain = makeQueryChain({ data: { id: "exists" }, error: null });
    const secondDupChain = makeQueryChain({ data: null, error: null });
    const openTradeChain = makeQueryChain({ data: null, error: null });
    const insertTradeChain = { insert: vi.fn().mockResolvedValue({ error: null }) };
    const insertOrderChain = { insert: vi.fn().mockResolvedValue({ error: null }) };

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "Order" && callCount === 0) { callCount++; return firstDupChain; }
      if (table === "Order" && callCount === 1) { callCount++; return secondDupChain; }
      if (table === "Trade" && callCount === 2) { callCount++; return openTradeChain; }
      if (table === "Trade" && callCount === 3) { callCount++; return insertTradeChain; }
      if (table === "Order" && callCount === 4) { callCount++; return insertOrderChain; }
      return makeQueryChain({ data: null, error: null });
    });

    const results = await processExecutions(
      [
        makeExec({ brokerExecId: "EXEC_DUP" }),
        makeExec({ brokerExecId: "EXEC_NEW" }),
      ],
      USER_ID
    );

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("SKIPPED_DUPLICATE");
    expect(results[1].status).toBe("PROCESSED");
  });
});
