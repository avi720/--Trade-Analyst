import { XMLParser } from "fast-xml-parser";
import { parseIbkrDate } from "./parse-date";
import type { NormalizedExecution } from "../../types/trade";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  // Treat attribute values as numbers/booleans where appropriate
  parseAttributeValue: true,
  // Always return arrays for these tags so single-item responses don't differ
  isArray: (name) => name === "Trade" || name === "Order",
});

// Validates that an execution is an STK (stock). Returns false for options, futures, etc.
export function validateStk(exec: NormalizedExecution): boolean {
  return exec.assetClass === "STK";
}

// Normalizes the IBKR Buy/Sell field to our internal side values.
// "Buy" → BUY, "Sell" → SELL, "SSHORT" → SELL (FIFO logic detects short openings by position state)
function normalizeSide(raw: unknown): "BUY" | "SELL" | "SSHORT" | null {
  if (typeof raw !== "string") return null;
  const upper = raw.toUpperCase();
  if (upper === "BUY") return "BUY";
  if (upper === "SELL") return "SELL";
  if (upper === "SSHORT") return "SSHORT";
  return null;
}

function toNumber(val: unknown): number | null {
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function toString(val: unknown): string | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  return String(val);
}

/**
 * Resolves FlexStatement from a parsed XML doc.
 *
 * IBKR returns two possible root shapes depending on query type / SDK version:
 *   (a) FlexStatements → FlexStatement          (test XML / older format)
 *   (b) FlexQueryResponse → FlexStatements → FlexStatement  (real Activity reports)
 */
function resolveStatement(doc: Record<string, unknown>): Record<string, unknown> | null {
  type D = Record<string, Record<string, unknown>>;
  const statements =
    (doc as D)?.FlexQueryResponse?.FlexStatements ??
    (doc as D)?.FlexStatements;

  if (!statements) return null;
  const stmt = (statements as Record<string, unknown>)?.FlexStatement;
  return (stmt as Record<string, unknown>) ?? null;
}

/**
 * Converts a raw IBKR Activity trade node into NormalizedExecution.
 *
 * Handles both naming conventions that IBKR Activity XML uses:
 *   - PascalCase (older fixture format): ExecID, Symbol, Buy/Sell, Price, Commission…
 *   - camelCase  (real IBKR Activity):   ibExecID, symbol, buySell, tradePrice, ibCommission…
 *
 * Returns null if required fields are missing or unparseable — caller skips these.
 */
function normalizeNode(node: Record<string, unknown>): NormalizedExecution | null {
  // ExecID: PascalCase → "ExecID", camelCase → "ibExecID"
  const execId = toString(node["ExecID"] ?? node["ibExecID"]);
  if (!execId) {
    console.warn("[parse-flex-xml] Skipping node: missing ExecID", node);
    return null;
  }

  // Symbol: PascalCase → "Symbol", camelCase → "symbol"
  const ticker = toString(node["Symbol"] ?? node["symbol"]);
  if (!ticker) {
    console.warn("[parse-flex-xml] Skipping node: missing Symbol", node);
    return null;
  }

  // Buy/Sell: PascalCase → "Buy/Sell" / "BuySell", camelCase → "buySell"
  const side = normalizeSide(node["Buy/Sell"] ?? node["BuySell"] ?? node["buySell"]);
  if (!side) {
    console.warn("[parse-flex-xml] Skipping node: invalid Buy/Sell value", node);
    return null;
  }

  // Quantity: PascalCase → "Quantity", camelCase → "quantity"
  const quantity = toNumber(node["Quantity"] ?? node["quantity"]);
  if (quantity === null) {
    console.warn("[parse-flex-xml] Skipping node: invalid Quantity", node);
    return null;
  }

  // Price: PascalCase → "Price", camelCase → "tradePrice"
  const price = toNumber(node["Price"] ?? node["tradePrice"]);
  if (price === null) {
    console.warn("[parse-flex-xml] Skipping node: invalid Price", node);
    return null;
  }

  // Date/Time: PascalCase → "Date/Time" / "DateTime", camelCase → "dateTime"
  const rawDateTime = node["Date/Time"] ?? node["DateTime"] ?? node["dateTime"];
  const executedAt = typeof rawDateTime === "string" ? parseIbkrDate(rawDateTime) : null;
  if (!executedAt) {
    console.warn("[parse-flex-xml] Skipping node: unparseable Date/Time", rawDateTime, node);
    return null;
  }

  // Commission: PascalCase → "Commission", camelCase → "ibCommission"
  const commission = toNumber(node["Commission"] ?? node["ibCommission"]) ?? 0;

  // AssetClass: PascalCase → "AssetClass", camelCase → "assetCategory"
  const assetClass = toString(node["AssetClass"] ?? node["assetCategory"]);

  return {
    brokerExecId: execId,
    // OrderID: PascalCase → "OrderID", camelCase → "ibOrderID"
    brokerOrderId: toString(node["OrderID"] ?? node["ibOrderID"]),
    // TradeID: PascalCase → "TradeID", camelCase → "tradeID"
    brokerTradeId: toString(node["TradeID"] ?? node["tradeID"]),
    // AccountID: PascalCase → "ClientAccountID", camelCase → "accountId"
    brokerClientAccountId: toString(node["ClientAccountID"] ?? node["accountId"]),
    ticker,
    assetClass,
    side,
    quantity: Math.abs(quantity), // IBKR sometimes sends negative quantity for sells
    price: Math.abs(price),
    commission: Math.abs(commission),
    executedAt,
    // Currency: PascalCase → "CurrencyPrimary", camelCase → "currency"
    currency: toString(node["CurrencyPrimary"] ?? node["currency"]),
    exchange: toString(node["Exchange"] ?? node["exchange"]),
    // OrderType: PascalCase → "OrderType", camelCase → "orderType"
    orderType: toString(node["OrderType"] ?? node["orderType"]),
    rawPayload: node,
  };
}

// Parses an Activity Flex Query XML response.
// Node path: [FlexQueryResponse →] FlexStatements → FlexStatement → Trades → Trade[]
export function parseActivityXml(xml: string): NormalizedExecution[] {
  if (!xml || xml.trim() === "") return [];

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    console.error("[parse-flex-xml] Failed to parse XML:", err);
    return [];
  }

  const statement = resolveStatement(doc);
  if (!statement) return [];

  const trades = statement?.Trades;
  if (!trades) return [];

  const nodes: Record<string, unknown>[] = Array.isArray(
    (trades as Record<string, unknown>)?.Trade
  )
    ? ((trades as Record<string, unknown>).Trade as Record<string, unknown>[])
    : [];

  return nodes.flatMap((node) => {
    const exec = normalizeNode(node);
    return exec ? [exec] : [];
  });
}
