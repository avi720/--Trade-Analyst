"use client";

import { useEffect, useState } from "react";

interface ConnectionStatus {
  pollingIntervalMin?: number;
  pricePollingIntervalMin?: number;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastPriceSyncAt?: string | null;
  lastPriceSyncStatus?: string | null;
}

function dotColor(lastAt: string | null | undefined, intervalMin: number): string {
  if (!lastAt) return "bg-[#888888]";
  const msSince = Date.now() - new Date(lastAt).getTime();
  const intervalMs = intervalMin * 60 * 1000;
  if (msSince < intervalMs * 2) return "bg-[#2CC84A]";
  if (msSince < intervalMs * 5) return "bg-[#FFB800]";
  return "bg-[#FF4D4D]";
}

function formatShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
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

  const ibkrIntervalMin = conn?.pollingIntervalMin ?? 15;
  const priceIntervalMin = conn?.pricePollingIntervalMin ?? 15;

  const ibkrColor = dotColor(conn?.lastSyncAt, ibkrIntervalMin);
  const priceColor = dotColor(conn?.lastPriceSyncAt, priceIntervalMin);

  const ibkrLabel = formatShort(conn?.lastSyncAt);
  const priceLabel = formatShort(conn?.lastPriceSyncAt);

  const ibkrTitle = conn?.lastSyncAt
    ? `IBKR — סנכרון אחרון: ${new Date(conn.lastSyncAt).toLocaleString("he-IL")} (${conn.lastSyncStatus ?? "—"})`
    : "IBKR — טרם סונכרן";

  const priceTitle = conn?.lastPriceSyncAt
    ? `מחירים — עדכון אחרון: ${new Date(conn.lastPriceSyncAt).toLocaleString("he-IL")} (${conn.lastPriceSyncStatus ?? "—"})`
    : "מחירים — טרם עודכן";

  return (
    <div className="flex items-center gap-2 text-xs text-[#888888] font-mono">
      <span className="flex items-center gap-1" title={ibkrTitle}>
        <span className={`w-1.5 h-1.5 rounded-full ${ibkrColor}`} />
        IBKR {ibkrLabel}
      </span>
      <span className="flex items-center gap-1" title={priceTitle}>
        <span className={`w-1.5 h-1.5 rounded-full ${priceColor}`} />
        מחירים {priceLabel}
      </span>
    </div>
  );
}
