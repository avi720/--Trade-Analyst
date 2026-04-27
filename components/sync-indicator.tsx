"use client";

import { useEffect, useState } from "react";

interface ConnectionStatus {
  pollingIntervalMin?: number;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
}

function dotColor(lastSyncAt: string | null | undefined, intervalMin: number): string {
  if (!lastSyncAt) return "bg-[#888888]";
  const msSince = Date.now() - new Date(lastSyncAt).getTime();
  const intervalMs = intervalMin * 60 * 1000;
  if (msSince < intervalMs * 2) return "bg-[#2CC84A]";
  if (msSince < intervalMs * 5) return "bg-[#FFB800]";
  return "bg-[#FF4D4D]";
}

function formatShort(iso: string | null | undefined): string {
  if (!iso) return "—";
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

  const intervalMin = conn?.pollingIntervalMin ?? 15;
  const color = dotColor(conn?.lastSyncAt, intervalMin);
  const label = formatShort(conn?.lastSyncAt);
  const title = conn?.lastSyncAt
    ? `IBKR — סנכרון אחרון: ${new Date(conn.lastSyncAt).toLocaleString("he-IL")} (${conn.lastSyncStatus ?? "—"})`
    : "IBKR — טרם סונכרן";

  return (
    <div className="flex items-center gap-2 text-xs text-[#888888] font-mono">
      <span className="flex items-center gap-1" title={title}>
        <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
        IBKR {conn ? label : ""}
      </span>
      {/* Phase 4 placeholder */}
      <span className="flex items-center gap-1" title="Polygon — Phase 4">
        <span className="w-1.5 h-1.5 rounded-full bg-[#888888]" />
        מחירים
      </span>
    </div>
  );
}
