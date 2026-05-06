import { describe, it, expect } from "vitest";
import {
  parseActivityXml,
  validateStk,
} from "../lib/ibkr/parse-flex-xml";

// --- Mock XML builders ---

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

// --- Tests ---

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

describe("parseActivityXml — real IBKR format (camelCase + FlexQueryResponse wrapper)", () => {
  // Real IBKR Activity XML uses:
  //   - FlexQueryResponse root element (instead of bare FlexStatements)
  //   - camelCase attribute names (ibExecID, symbol, buySell, tradePrice, ibCommission…)
  //   - assetCategory instead of AssetClass
  //   - dateTime instead of Date/Time
  function makeRealActivityXml(tradeNodes: string[]): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<FlexQueryResponse queryName="TradeAnalysis_History" type="AF">
<FlexStatements count="1">
<FlexStatement accountId="U18277746" fromDate="14/10/2025" toDate="24/04/2026" period="LastNCalendarDays" whenGenerated="27/04/2026;04:38:59 EDT">
<Trades>
${tradeNodes.join("\n")}
</Trades>
</FlexStatement>
</FlexStatements>
</FlexQueryResponse>`;
  }

  const REAL_BUY = `<Trade accountId="U18277746" currency="USD" assetCategory="STK" symbol="QQQ"
    tradeID="8472019748" dateTime="31/10/2025;14:07:12 EDT" quantity="2"
    proceeds="-1257.6" ibCommission="-2" netCash="-1259.6" buySell="BUY"
    ibOrderID="4560070212" ibExecID="0001a2f5.6904c07e.01.01"
    orderType="LMT" tradeDate="31/10/2025" exchange="IBKRATS" tradePrice="628.8"
    taxes="0" ibCommissionCurrency="USD" orderTime="31/10/2025;14:07:12 EDT" />`;

  const REAL_SELL = `<Trade accountId="U18277746" currency="USD" assetCategory="STK" symbol="QQQ"
    tradeID="8472099999" dateTime="05/11/2025;10:30:00 EST" quantity="-2"
    proceeds="1260.0" ibCommission="-2" netCash="1258.0" buySell="SELL"
    ibOrderID="4560099999" ibExecID="0001a2f5.6904ffff.01.01"
    orderType="MKT" tradeDate="05/11/2025" exchange="NASDAQ" tradePrice="630.0"
    taxes="0" ibCommissionCurrency="USD" orderTime="05/11/2025;10:30:00 EST" />`;

  const REAL_CASH = `<Trade accountId="U18277746" currency="ILS" assetCategory="CASH" symbol="USD.ILS"
    tradeID="8458311410" dateTime="30/10/2025;01:52:38 EDT" quantity="1843"
    proceeds="-5997.63804" ibCommission="-3.06710833" netCash="0" buySell="BUY"
    ibOrderID="4551428366" ibExecID="00024d0d.68fe9beb.01.01"
    orderType="MKT" tradeDate="30/10/2025" exchange="IDEALFX" tradePrice="3.25428"
    taxes="0" ibCommissionCurrency="USD" orderTime="30/10/2025;01:52:38 EDT" />`;

  it("parses a real IBKR BUY trade (camelCase + FlexQueryResponse wrapper)", () => {
    const results = parseActivityXml(makeRealActivityXml([REAL_BUY]));
    expect(results).toHaveLength(1);
    const exec = results[0];
    expect(exec.brokerExecId).toBe("0001a2f5.6904c07e.01.01");
    expect(exec.ticker).toBe("QQQ");
    expect(exec.side).toBe("BUY");
    expect(exec.quantity).toBe(2);
    expect(exec.price).toBe(628.8);
    expect(exec.commission).toBe(2);
    expect(exec.assetClass).toBe("STK");
    expect(exec.currency).toBe("USD");
    expect(exec.brokerOrderId).toBe("4560070212");
    expect(exec.executedAt).toBeInstanceOf(Date);
    // 31/10/2025 14:07:12 EDT = UTC+4 = 18:07:12 UTC
    expect(exec.executedAt.toISOString()).toBe("2025-10-31T18:07:12.000Z");
  });

  it("parses SELL with negative quantity — quantity is abs()", () => {
    const results = parseActivityXml(makeRealActivityXml([REAL_SELL]));
    expect(results).toHaveLength(1);
    expect(results[0].side).toBe("SELL");
    expect(results[0].quantity).toBe(2); // abs(-2)
    expect(results[0].price).toBe(630.0);
  });

  it("filters out CASH (forex) entries via validateStk", () => {
    const results = parseActivityXml(makeRealActivityXml([REAL_BUY, REAL_CASH]));
    // Both parsed — but CASH filtered later by validateStk in processExecutions
    expect(results).toHaveLength(2);
    expect(validateStk(results[0])).toBe(true);  // STK
    expect(validateStk(results[1])).toBe(false); // CASH
  });

  it("parses multiple trades in real format", () => {
    const results = parseActivityXml(makeRealActivityXml([REAL_BUY, REAL_SELL]));
    expect(results).toHaveLength(2);
    expect(results.map(r => r.brokerExecId)).toEqual([
      "0001a2f5.6904c07e.01.01",
      "0001a2f5.6904ffff.01.01",
    ]);
  });
});

