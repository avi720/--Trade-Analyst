import { XMLParser } from "fast-xml-parser";
import { parseIbkrDate } from "./parse-date";
import type { NormalizedExecution } from "../../types/trade";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  // Treat attribute values as numbers/booleans where appropriate
  parseAttributeValue: true,
  // Always return arrays for these tags so single-item responses don't differ
  isArray: (name) =>
    name === "TradeConfirm" || name === "Trade" || name === "Order",
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
 * Converts a raw IBKR trade node into NormalizedExecution.
 *
 * Handles both naming conventions that IBKR uses:
 *   - TradeConfirm reports: PascalCase  (ExecID, Symbol, Buy/Sell, Price, Commission…)
 *   - Activity reports:     camelCase   (ibExecID, symbol, buySell, tradePrice, ibCommission…)
 *
 * Returns null if required fields are missing or unparseable — caller skips these.
 */
function normalizeNode(node: Record<string, unknown>): NormalizedExecution | null {
  // ExecID: TradeConfirm → "ExecID", Activity → "ibExecID"
  const execId = toString(node["ExecID"] ?? node["ibExecID"]);
  if (!execId) {
    console.warn("[parse-flex-xml] Skipping node: missing ExecID", node);
    return null;
  }

  // Symbol: TradeConfirm → "Symbol", Activity → "symbol"
  const ticker = toString(node["Symbol"] ?? node["symbol"]);
  if (!ticker) {
    console.warn("[parse-flex-xml] Skipping node: missing Symbol", node);
    return null;
  }

  // Buy/Sell: TradeConfirm → "Buy/Sell" / "BuySell", Activity → "buySell"
  const side = normalizeSide(node["Buy/Sell"] ?? node["BuySell"] ?? node["buySell"]);
  if (!side) {
    console.warn("[parse-flex-xml] Skipping node: invalid Buy/Sell value", node);
    return null;
  }

  // Quantity: TradeConfirm → "Quantity", Activity → "quantity"
  const quantity = toNumber(node["Quantity"] ?? node["quantity"]);
  if (quantity === null) {
    console.warn("[parse-flex-xml] Skipping node: invalid Quantity", node);
    return null;
  }

  // Price: TradeConfirm → "Price", Activity → "tradePrice"
  const price = toNumber(node["Price"] ?? node["tradePrice"]);
  if (price === null) {
    console.warn("[parse-flex-xml] Skipping node: invalid Price", node);
    return null;
  }

  // Date/Time: TradeConfirm → "Date/Time" / "DateTime", Activity → "dateTime"
  const rawDateTime = node["Date/Time"] ?? node["DateTime"] ?? node["dateTime"];
  const executedAt = typeof rawDateTime === "string" ? parseIbkrDate(rawDateTime) : null;
  if (!executedAt) {
    console.warn("[parse-flex-xml] Skipping node: unparseable Date/Time", rawDateTime, node);
    return null;
  }

  // Commission: TradeConfirm → "Commission", Activity → "ibCommission"
  const commission = toNumber(node["Commission"] ?? node["ibCommission"]) ?? 0;

  // AssetClass: TradeConfirm → "AssetClass", Activity → "assetCategory"
  const assetClass = toString(node["AssetClass"] ?? node["assetCategory"]);

  return {
    brokerExecId: execId,
    // OrderID: TradeConfirm → "OrderID", Activity → "ibOrderID"
    brokerOrderId: toString(node["OrderID"] ?? node["ibOrderID"]),
    // TradeID: TradeConfirm → "TradeID", Activity → "tradeID"
    brokerTradeId: toString(node["TradeID"] ?? node["tradeID"]),
    // AccountID: TradeConfirm → "ClientAccountID", Activity → "accountId"
    brokerClientAccountId: toString(node["ClientAccountID"] ?? node["accountId"]),
    ticker,
    assetClass,
    side,
    quantity: Math.abs(quantity), // IBKR sometimes sends negative quantity for sells
    price: Math.abs(price),
    commission: Math.abs(commission),
    executedAt,
    // Currency: TradeConfirm → "CurrencyPrimary", Activity → "currency"
    currency: toString(node["CurrencyPrimary"] ?? node["currency"]),
    exchange: toString(node["Exchange"] ?? node["exchange"]),
    // OrderType: TradeConfirm → "OrderType", Activity → "orderType"
    orderType: toString(node["OrderType"] ?? node["orderType"]),
    rawPayload: node,
  };
}

// Parses a Trade Confirmations Flex Query XML response.
// Node path: [FlexQueryResponse →] FlexStatements → FlexStatement → TradeConfirms → TradeConfirm[]
export function parseTradeConfirmXml(xml: string): NormalizedExecution[] {
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

  const confirms = statement?.TradeConfirms;
  if (!confirms) return []; // empty response — no trades for the period

  const nodes: Record<string, unknown>[] = Array.isArray(
    (confirms as Record<string, unknown>)?.TradeConfirm
  )
    ? ((confirms as Record<string, unknown>).TradeConfirm as Record<string, unknown>[])
    : [];

  return nodes.flatMap((node) => {
    const exec = normalizeNode(node);
    return exec ? [exec] : [];
  });
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
