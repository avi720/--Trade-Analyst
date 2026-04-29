import type { NormalizedExecution } from "../../types/trade";

const CSV_HEADERS = [
  "ExecID",
  "OrderID",
  "TradeID",
  "AccountID",
  "Symbol",
  "AssetClass",
  "Side",
  "Quantity",
  "Price",
  "Commission",
  "Currency",
  "Exchange",
  "OrderType",
  "ExecutedAt",
] as const;

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Quote fields that contain comma, quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function executionsToCsv(executions: NormalizedExecution[]): string {
  const rows: string[] = [CSV_HEADERS.join(",")];

  for (const exec of executions) {
    const row = [
      exec.brokerExecId,
      exec.brokerOrderId ?? "",
      exec.brokerTradeId ?? "",
      exec.brokerClientAccountId ?? "",
      exec.ticker,
      exec.assetClass ?? "",
      exec.side,
      exec.quantity,
      exec.price,
      exec.commission,
      exec.currency ?? "",
      exec.exchange ?? "",
      exec.orderType ?? "",
      exec.executedAt.toISOString(),
    ].map(escapeCsvField);

    rows.push(row.join(","));
  }

  return rows.join("\r\n");
}
