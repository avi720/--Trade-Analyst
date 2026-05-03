"use client";

import { useEffect, useState } from "react";

// Transient IBKR error codes — the next cron run will likely succeed on its own.
// All other error codes are treated as fatal (red) and require user action.
// Source: https://www.ibkrguides.com/clientportal/performanceandstatements/flex3error.htm
const IBKR_TRANSIENT_CODES = new Set([
  "1001", // Statement could not be generated at this time
  "1004", // Statement is incomplete at this time
  "1005", // Settlement data is not ready
  "1006", // FIFO P/L data is not ready
  "1007", // MTM P/L data is not ready
  "1008", // MTM and FIFO P/L data is not ready
  "1009", // Server under heavy load
  "1017", // Reference code is invalid (step-2 code expired; fresh code next run)
  "1018", // Too many requests (rate limit; next run will be fine)
  "1019", // Statement generation in progress
  "1021", // Statement could not be retrieved at this time
]);

interface ConnectionStatus {
  pricePollingIntervalMin?: number;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastPriceSyncAt?: string | null;
  lastPriceSyncStatus?: string | null;
}

/**
 * Green  — last sync succeeded.
 * Amber  — last sync failed with a transient error; next cron will likely fix it.
 * Red    — last sync failed with a fatal error (expired token, invalid query, etc.).
 * Gray   — never synced.
 */
function ibkrDotColor(
  lastSyncAt: string | null | undefined,
  lastSyncStatus: string | null | undefined,
  lastSyncError: string | null | undefined,
): string {
  if (!lastSyncAt) return "bg-[#888888]";
  if (lastSyncStatus === "SUCCESS") return "bg-[#2CC84A]";

  // Extract error code from "IBKR Flex (CODE): MESSAGE" format
  const match = lastSyncError?.match(/IBKR Flex \((\d+)\)/);
  if (match && IBKR_TRANSIENT_CODES.has(match[1])) return "bg-[#FFB800]";

  return "bg-[#FF4D4D]";
}

function formatShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso + "Z").getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `${mins}d`;
  return `${Math.floor(mins / 60)}h`;
}

export function SyncIndicator() {
  const [conn, setConn] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/ibkr/connection");
        if (res.ok) {
          const json = await res.json();
          setConn(json.connection ?? null);
        }
      } catch {
        // silently fail — indicator stays gray
      }
    }
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  const ibkrColor = ibkrDotColor(conn?.lastSyncAt, conn?.lastSyncStatus, conn?.lastSyncError);
  const ibkrLabel = formatShort(conn?.lastSyncAt);

  const ibkrTitle = conn?.lastSyncAt
    ? `IBKR — סנכרון אחרון: ${new Date(conn.lastSyncAt + "Z").toLocaleString("he-IL")} (${conn.lastSyncStatus ?? "—"})`
    : "IBKR — טרם סונכרן";

  /* DASHBOARD-FUTURE: price sync indicator — re-enable when live dashboard is released.
  const priceColor = dotColor(conn?.lastPriceSyncAt, conn?.lastPriceSyncStatus, null);
  const priceLabel = formatShort(conn?.lastPriceSyncAt);
  const priceTitle = conn?.lastPriceSyncAt
    ? `מחירים — עדכון אחרון: ${new Date(conn.lastPriceSyncAt + "Z").toLocaleString("he-IL")} (${conn.lastPriceSyncStatus ?? "—"})`
    : "מחירים — טרם עודכן";
  */

  return (
    <div className="flex items-center gap-2 text-xs text-[#888888] font-mono">
      <span className="flex items-center gap-1" title={ibkrTitle}>
        <span className={`w-1.5 h-1.5 rounded-full ${ibkrColor}`} />
        IBKR {ibkrLabel}
      </span>
      {/* DASHBOARD-FUTURE: price sync dot — uncomment with price indicator vars above.
      <span className="flex items-center gap-1" title={priceTitle}>
        <span className={`w-1.5 h-1.5 rounded-full ${priceColor}`} />
        מחירים {priceLabel}
      </span>
      */}
    </div>
  );
}
