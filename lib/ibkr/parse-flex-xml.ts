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

// Converts a raw IBKR trade node (from either query type) into NormalizedExecution.
// Returns null if required fields are missing or unparseable — caller should skip these.
function normalizeNode(node: Record<string, unknown>): NormalizedExecution | null {
  const execId = toString(node["ExecID"]);
  if (!execId) {
    console.warn("[parse-flex-xml] Skipping node: missing ExecID", node);
    return null;
  }

  const ticker = toString(node["Symbol"]);
  if (!ticker) {
    console.warn("[parse-flex-xml] Skipping node: missing Symbol", node);
    return null;
  }

  const side = normalizeSide(node["Buy/Sell"] ?? node["BuySell"]);
  if (!side) {
    console.warn("[parse-flex-xml] Skipping node: invalid Buy/Sell value", node);
    return null;
  }

  const quantity = toNumber(node["Quantity"]);
  if (quantity === null) {
    console.warn("[parse-flex-xml] Skipping node: invalid Quantity", node);
    return null;
  }

  const price = toNumber(node["Price"]);
  if (price === null) {
    console.warn("[parse-flex-xml] Skipping node: invalid Price", node);
    return null;
  }

  // Date/Time is the primary timestamp — prefer it over TradeDate
  const rawDateTime = node["Date/Time"] ?? node["DateTime"];
  const executedAt = typeof rawDateTime === "string" ? parseIbkrDate(rawDateTime) : null;
  if (!executedAt) {
    console.warn("[parse-flex-xml] Skipping node: unparseable Date/Time", rawDateTime, node);
    return null;
  }

  const commission = toNumber(node["Commission"]) ?? 0;
  const assetClass = toString(node["AssetClass"]);

  return {
    brokerExecId: execId,
    brokerOrderId: toString(node["OrderID"]),
    brokerTradeId: toString(node["TradeID"]),
    brokerClientAccountId: toString(node["ClientAccountID"]),
    ticker,
    assetClass,
    side,
    quantity: Math.abs(quantity), // IBKR sometimes sends negative quantity for sells
    price: Math.abs(price),
    commission: Math.abs(commission),
    executedAt,
    currency: toString(node["CurrencyPrimary"]),
    exchange: toString(node["Exchange"]),
    orderType: toString(node["OrderType"]),
    rawPayload: node,
  };
}

// Parses a Trade Confirmations Flex Query XML response.
// Node path: FlexStatements → FlexStatement → TradeConfirms → TradeConfirm[]
export function parseTradeConfirmXml(xml: string): NormalizedExecution[] {
  if (!xml || xml.trim() === "") return [];

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    console.error("[parse-flex-xml] Failed to parse XML:", err);
    return [];
  }

  const statement = (doc as Record<string, Record<string, unknown>>)
    ?.FlexStatements?.FlexStatement;

  if (!statement) return [];

  const confirms = (statement as Record<string, unknown>)?.TradeConfirms;
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
// Node path: FlexStatements → FlexStatement → Trades → Trade[]
export function parseActivityXml(xml: string): NormalizedExecution[] {
  if (!xml || xml.trim() === "") return [];

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    console.error("[parse-flex-xml] Failed to parse XML:", err);
    return [];
  }

  const statement = (doc as Record<string, Record<string, unknown>>)
    ?.FlexStatements?.FlexStatement;

  if (!statement) return [];

  const trades = (statement as Record<string, unknown>)?.Trades;
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
