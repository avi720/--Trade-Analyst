import { describe, it, expect } from "vitest";
import {
  parseTradeConfirmXml,
  parseActivityXml,
  validateStk,
} from "../lib/ibkr/parse-flex-xml";

// --- Mock XML builders ---

function makeTradeConfirmXml(trades: string[]): string {
  const inner = trades.join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<FlexStatements count="1">
  <FlexStatement accountId="U1234567" fromDate="20260401" toDate="20260426" period="Last Business Day" whenGenerated="20260426;10:00:00 EST">
    <TradeConfirms>
      ${inner}
    </TradeConfirms>
  </FlexStatement>
</FlexStatements>`;
}

function makeActivityXml(trades: string[]): string {
  const inner = trades.join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<FlexStatements count="1">
  <FlexStatement accountId="U1234567" fromDate="20260101" toDate="20260426" period="Last 90 Days" whenGenerated="20260426;10:00:00 EST">
    <Trades>
      ${inner}
    </Trades>
  </FlexStatement>
</FlexStatements>`;
}

const BUY_STK = `<TradeConfirm
  ClientAccountID="U1234567"
  CurrencyPrimary="USD"
  AssetClass="STK"
  Symbol="AAPL"
  TradeID="123456"
  OrderID="789012"
  ExecID="EXEC001"
  OrderTime="23/04/2026;09:30:00 EST"
  Date/Time="23/04/2026;09:30:00 EST"
  TradeDate="2026-04-23"
  Exchange="NASDAQ"
  Buy/Sell="Buy"
  Quantity="100"
  Price="175.50"
  Proceeds="-17550.00"
  NetCash="-17551.50"
  Commission="1.50"
  CommissionCurrency="USD"
  Tax="0"
  OrderType="LMT"
/>`;

const SELL_STK = `<TradeConfirm
  ClientAccountID="U1234567"
  CurrencyPrimary="USD"
  AssetClass="STK"
  Symbol="AAPL"
  TradeID="123457"
  OrderID="789013"
  ExecID="EXEC002"
  OrderTime="24/04/2026;10:00:00 EST"
  Date/Time="24/04/2026;10:00:00 EST"
  TradeDate="2026-04-24"
  Exchange="NASDAQ"
  Buy/Sell="Sell"
  Quantity="100"
  Price="180.00"
  Proceeds="18000.00"
  NetCash="17998.50"
  Commission="1.50"
  CommissionCurrency="USD"
  Tax="0"
  OrderType="LMT"
/>`;

const SSHORT_STK = `<TradeConfirm
  ClientAccountID="U1234567"
  CurrencyPrimary="USD"
  AssetClass="STK"
  Symbol="TSLA"
  TradeID="200001"
  OrderID="300001"
  ExecID="EXEC003"
  OrderTime="23/04/2026;14:00:00 EST"
  Date/Time="23/04/2026;14:00:00 EST"
  TradeDate="2026-04-23"
  Exchange="NASDAQ"
  Buy/Sell="SSHORT"
  Quantity="50"
  Price="170.00"
  Proceeds="8500.00"
  NetCash="8498.50"
  Commission="1.50"
  CommissionCurrency="USD"
  Tax="0"
  OrderType="LMT"
/>`;

const PARTIAL_FILL_1 = `<TradeConfirm
  ClientAccountID="U1234567"
  CurrencyPrimary="USD"
  AssetClass="STK"
  Symbol="MSFT"
  TradeID="400001"
  OrderID="500001"
  ExecID="EXEC_PF1"
  OrderTime="23/04/2026;11:00:00 EST"
  Date/Time="23/04/2026;11:00:00 EST"
  TradeDate="2026-04-23"
  Exchange="NASDAQ"
  Buy/Sell="Buy"
  Quantity="100"
  Price="400.00"
  Proceeds="-40000.00"
  NetCash="-40000.50"
  Commission="0.50"
  CommissionCurrency="USD"
  Tax="0"
  OrderType="LMT"
/>`;

const PARTIAL_FILL_2 = `<TradeConfirm
  ClientAccountID="U1234567"
  CurrencyPrimary="USD"
  AssetClass="STK"
  Symbol="MSFT"
  TradeID="400001"
  OrderID="500001"
  ExecID="EXEC_PF2"
  OrderTime="23/04/2026;11:01:00 EST"
  Date/Time="23/04/2026;11:01:00 EST"
  TradeDate="2026-04-23"
  Exchange="NASDAQ"
  Buy/Sell="Buy"
  Quantity="100"
  Price="400.05"
  Proceeds="-40005.00"
  NetCash="-40005.50"
  Commission="0.50"
  CommissionCurrency="USD"
  Tax="0"
  OrderType="LMT"
/>`;

const PARTIAL_FILL_3 = `<TradeConfirm
  ClientAccountID="U1234567"
  CurrencyPrimary="USD"
  AssetClass="STK"
  Symbol="MSFT"
  TradeID="400001"
  OrderID="500001"
  ExecID="EXEC_PF3"
  OrderTime="23/04/2026;11:02:00 EST"
  Date/Time="23/04/2026;11:02:00 EST"
  TradeDate="2026-04-23"
  Exchange="NASDAQ"
  Buy/Sell="Buy"
  Quantity="100"
  Price="400.10"
  Proceeds="-40010.00"
  NetCash="-40010.50"
  Commission="0.50"
  CommissionCurrency="USD"
  Tax="0"
  OrderType="LMT"
/>`;

const NON_STK_OPT = `<TradeConfirm
  ClientAccountID="U1234567"
  CurrencyPrimary="USD"
  AssetClass="OPT"
  Symbol="AAPL  260417C00200000"
  TradeID="999001"
  OrderID="999002"
  ExecID="EXEC_OPT"
  OrderTime="23/04/2026;10:00:00 EST"
  Date/Time="23/04/2026;10:00:00 EST"
  TradeDate="2026-04-23"
  Exchange="CBOE"
  Buy/Sell="Buy"
  Quantity="1"
  Price="5.00"
  Proceeds="-500.00"
  NetCash="-501.00"
  Commission="1.00"
  CommissionCurrency="USD"
  Tax="0"
  OrderType="LMT"
/>`;

const MISSING_EXEC_ID = `<TradeConfirm
  ClientAccountID="U1234567"
  CurrencyPrimary="USD"
  AssetClass="STK"
  Symbol="GOOGL"
  TradeID="111001"
  OrderID="111002"
  OrderTime="23/04/2026;10:00:00 EST"
  Date/Time="23/04/2026;10:00:00 EST"
  TradeDate="2026-04-23"
  Exchange="NASDAQ"
  Buy/Sell="Buy"
  Quantity="10"
  Price="150.00"
  Commission="1.00"
  CommissionCurrency="USD"
  Tax="0"
  OrderType="LMT"
/>`;

const UNKNOWN_TZ = `<TradeConfirm
  ClientAccountID="U1234567"
  CurrencyPrimary="USD"
  AssetClass="STK"
  Symbol="NVDA"
  TradeID="222001"
  OrderID="222002"
  ExecID="EXEC_BAD_TZ"
  OrderTime="23/04/2026;10:00:00 XYZ"
  Date/Time="23/04/2026;10:00:00 XYZ"
  TradeDate="2026-04-23"
  Exchange="NASDAQ"
  Buy/Sell="Buy"
  Quantity="5"
  Price="900.00"
  Commission="1.00"
  CommissionCurrency="USD"
  Tax="0"
  OrderType="LMT"
/>`;

const IBKR_ERROR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<FlexStatementOperationMessage>
  <ErrorCode>1006</ErrorCode>
  <ErrorMessage>Invalid query ID</ErrorMessage>
</FlexStatementOperationMessage>`;

// --- Tests ---

describe("parseTradeConfirmXml", () => {
  it("parses a valid STK BUY execution", () => {
    const results = parseTradeConfirmXml(makeTradeConfirmXml([BUY_STK]));
    expect(results).toHaveLength(1);
    const exec = results[0];
    expect(exec.brokerExecId).toBe("EXEC001");
    expect(exec.ticker).toBe("AAPL");
    expect(exec.side).toBe("BUY");
    expect(exec.quantity).toBe(100);
    expect(exec.price).toBe(175.5);
    expect(exec.commission).toBe(1.5);
    expect(exec.assetClass).toBe("STK");
    expect(exec.currency).toBe("USD");
    expect(exec.exchange).toBe("NASDAQ");
    expect(exec.brokerOrderId).toBe("789012");
    expect(exec.executedAt).toBeInstanceOf(Date);
    // 23/04/2026 09:30:00 EST = UTC+5 hours = 14:30:00 UTC
    expect(exec.executedAt.toISOString()).toBe("2026-04-23T14:30:00.000Z");
  });

  it("parses a SELL execution", () => {
    const results = parseTradeConfirmXml(makeTradeConfirmXml([SELL_STK]));
    expect(results).toHaveLength(1);
    expect(results[0].side).toBe("SELL");
    expect(results[0].brokerExecId).toBe("EXEC002");
  });

  it("parses SSHORT — side is SELL, assetClass is STK", () => {
    const results = parseTradeConfirmXml(makeTradeConfirmXml([SSHORT_STK]));
    expect(results).toHaveLength(1);
    const exec = results[0];
    expect(exec.side).toBe("SSHORT");
    expect(exec.assetClass).toBe("STK");
    expect(exec.ticker).toBe("TSLA");
  });

  it("parses partial fills — all 3 executions returned with same brokerOrderId", () => {
    const results = parseTradeConfirmXml(
      makeTradeConfirmXml([PARTIAL_FILL_1, PARTIAL_FILL_2, PARTIAL_FILL_3])
    );
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.brokerExecId)).toEqual([
      "EXEC_PF1",
      "EXEC_PF2",
      "EXEC_PF3",
    ]);
    // All share the same OrderID — critical for grouping partial fills
    expect(results.every((r) => r.brokerOrderId === "500001")).toBe(true);
  });

  it("non-STK execution is parsed but validateStk returns false", () => {
    const results = parseTradeConfirmXml(makeTradeConfirmXml([NON_STK_OPT]));
    expect(results).toHaveLength(1);
    expect(results[0].assetClass).toBe("OPT");
    expect(validateStk(results[0])).toBe(false);
  });

  it("STK execution passes validateStk", () => {
    const results = parseTradeConfirmXml(makeTradeConfirmXml([BUY_STK]));
    expect(validateStk(results[0])).toBe(true);
  });

  it("skips execution with missing ExecID — no crash, returns empty", () => {
    const results = parseTradeConfirmXml(makeTradeConfirmXml([MISSING_EXEC_ID]));
    expect(results).toHaveLength(0);
  });

  it("skips execution with unknown timezone — no crash", () => {
    const results = parseTradeConfirmXml(makeTradeConfirmXml([UNKNOWN_TZ]));
    expect(results).toHaveLength(0);
  });

  it("returns empty array for empty response (no TradeConfirms element)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FlexStatements count="1">
  <FlexStatement accountId="U1234567" fromDate="20260426" toDate="20260426">
  </FlexStatement>
</FlexStatements>`;
    expect(parseTradeConfirmXml(xml)).toHaveLength(0);
  });

  it("returns empty array for empty string input", () => {
    expect(parseTradeConfirmXml("")).toHaveLength(0);
  });

  it("returns empty array for malformed XML — no crash", () => {
    expect(parseTradeConfirmXml("<broken>xml")).toHaveLength(0);
  });

  it("mixes valid and invalid nodes — returns only valid ones", () => {
    const results = parseTradeConfirmXml(
      makeTradeConfirmXml([BUY_STK, MISSING_EXEC_ID, SELL_STK, UNKNOWN_TZ])
    );
    // Only BUY_STK and SELL_STK have valid ExecID + parseable date
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.brokerExecId)).toEqual(["EXEC001", "EXEC002"]);
  });
});

describe("parseActivityXml", () => {
  // Activity XML uses <Trades><Trade .../></Trades> instead of <TradeConfirms>
  function makeTrade(overrides: Record<string, string> = ""): string {
    return `<Trade
      ClientAccountID="U1234567"
      CurrencyPrimary="USD"
      AssetClass="STK"
      Symbol="AAPL"
      TradeID="555001"
      OrderID="666001"
      ExecID="EXEC_ACT001"
      OrderTime="10/01/2026;09:30:00 EST"
      Date/Time="10/01/2026;09:30:00 EST"
      TradeDate="2026-01-10"
      Exchange="NASDAQ"
      Buy/Sell="Buy"
      Quantity="200"
      Price="185.00"
      Proceeds="-37000.00"
      NetCash="-37001.50"
      Commission="1.50"
      CommissionCurrency="USD"
      Tax="0"
      OrderType="MKT"
      ${Object.entries(overrides).map(([k, v]) => `${k}="${v}"`).join(" ")}
    />`;
  }

  it("parses a valid Activity trade", () => {
    const xml = makeActivityXml([makeTrade()]);
    const results = parseActivityXml(xml);
    expect(results).toHaveLength(1);
    expect(results[0].brokerExecId).toBe("EXEC_ACT001");
    expect(results[0].ticker).toBe("AAPL");
    expect(results[0].quantity).toBe(200);
  });

  it("returns empty for empty Activity response", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FlexStatements count="1">
  <FlexStatement accountId="U1234567">
    <Trades></Trades>
  </FlexStatement>
</FlexStatements>`;
    expect(parseActivityXml(xml)).toHaveLength(0);
  });

  it("handles multiple Activity trades", () => {
    const xml = makeActivityXml([
      makeTrade({ ExecID: "ACT_A", Symbol: "AAPL" }),
      makeTrade({ ExecID: "ACT_B", Symbol: "MSFT" }),
      makeTrade({ ExecID: "ACT_C", Symbol: "NVDA" }),
    ]);
    const results = parseActivityXml(xml);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.brokerExecId)).toEqual(["ACT_A", "ACT_B", "ACT_C"]);
  });
});

describe("validateStk", () => {
  it("returns true for STK", () => {
    const results = parseTradeConfirmXml(makeTradeConfirmXml([BUY_STK]));
    expect(validateStk(results[0])).toBe(true);
  });

  it("returns false for OPT", () => {
    const results = parseTradeConfirmXml(makeTradeConfirmXml([NON_STK_OPT]));
    expect(validateStk(results[0])).toBe(false);
  });

  it("returns false when assetClass is undefined", () => {
    // Manually create a NormalizedExecution with no assetClass
    const exec = parseTradeConfirmXml(makeTradeConfirmXml([BUY_STK]))[0];
    const noClass = { ...exec, assetClass: undefined };
    expect(validateStk(noClass)).toBe(false);
  });
});
