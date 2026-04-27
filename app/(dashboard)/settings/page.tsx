"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";

// The 20 required IBKR Flex fields
const REQUIRED_FIELDS = [
  "ClientAccountID", "CurrencyPrimary", "AssetClass", "Symbol",
  "TradeID", "OrderID", "ExecID", "OrderTime", "Date/Time", "TradeDate",
  "Exchange", "Buy/Sell", "Quantity", "Price", "Proceeds", "NetCash",
  "Commission", "CommissionCurrency", "Tax", "OrderType",
];

interface ConnectionStatus {
  id?: string;
  flexQueryIdTrades?: string;
  flexQueryIdActivity?: string;
  pollingIntervalMin?: number;
  pricePollingIntervalMin?: number;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastBackfillAt?: string | null;
  lastBackfillStatus?: string | null;
  lastBackfillError?: string | null;
  lastPriceSyncAt?: string | null;
  lastPriceSyncStatus?: string | null;
}

interface TestResult {
  ok: boolean;
  error?: string;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  return new Date(iso).toLocaleDateString("he-IL");
}

// --- IBKR Setup Guide ---
function SetupGuide({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="border border-[#222222] rounded-md mb-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-right text-sm font-medium text-[#E0E0E0] hover:bg-[#1a1a1a] transition-colors"
      >
        <span className="flex items-center gap-2 text-[#FFB800]">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          מדריך הגדרה — Flex Web Service
        </span>
      </button>
      {open && (
        <div className="p-4 border-t border-[#222222] space-y-4 text-sm text-[#888888]">
          <div>
            <p className="text-[#E0E0E0] font-medium mb-1">שלב 1 — הפעלת Flex Web Service</p>
            <p>
              ב-IBKR Portal:{" "}
              <span className="text-[#E0E0E0]">Settings → Account Settings → Reports → Flex Web Service</span>
              {" "}→ לחץ "Enable" וקבל את ה-Token.
            </p>
          </div>
          <div>
            <p className="text-[#E0E0E0] font-medium mb-1">שלב 2 — יצירת Query 1 (Trade Confirmations)</p>
            <p>
              ב-IBKR Portal: <span className="text-[#E0E0E0]">Reports → Flex Queries → Create New → Trade Confirmations</span>
              <br />
              טווח: <span className="text-[#E0E0E0]">Today</span> (או Last Business Day)
              <br />
              פורמט תאריך: <span className="font-mono text-[#2CC84A]">dd/MM/yyyy</span> — פורמט שעה:{" "}
              <span className="font-mono text-[#2CC84A]">HH:mm:ss TimeZone</span>
            </p>
          </div>
          <div>
            <p className="text-[#E0E0E0] font-medium mb-1">שלב 3 — יצירת Query 2 (Activity)</p>
            <p>
              <span className="text-[#E0E0E0]">Reports → Flex Queries → Create New → Activity</span>
              <br />
              טווח: <span className="text-[#E0E0E0]">Last 90 Days</span> (או יותר)
              <br />
              <strong className="text-[#FFB800]">אותם 20 שדות בדיוק כמו Query 1.</strong>
            </p>
          </div>
          <div>
            <p className="text-[#E0E0E0] font-medium mb-2">
              20 השדות הנדרשים (זהים לשני ה-Queries):
            </p>
            <div className="grid grid-cols-2 gap-1">
              {REQUIRED_FIELDS.map((f) => (
                <span key={f} className="font-mono text-xs text-[#2CC84A] bg-[#0d1f12] px-2 py-1 rounded">
                  {f}
                </span>
              ))}
            </div>
          </div>
          <p className="text-xs text-[#555555]">
            שלב 4: העתק את ה-Token ואת שני ה-Query IDs לשדות למטה.
          </p>
        </div>
      )}
    </div>
  );
}

// --- Connection form + actions ---
export default function SettingsPage() {
  const [guideOpen, setGuideOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [testResult, setTestResult] = useState<{ query1: TestResult; query2: TestResult; firstSuccess?: boolean } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnectionStatus | null>(null);

  // Polygon form state
  const [pricePollingInterval, setPricePollingInterval] = useState(15);
  const [savingPrice, setSavingPrice] = useState(false);
  const [savePriceError, setSavePriceError] = useState<string | null>(null);
  const [savePriceOk, setSavePriceOk] = useState(false);

  // IBKR form state
  const [flexToken, setFlexToken] = useState("");
  const [queryIdTrades, setQueryIdTrades] = useState("");
  const [queryIdActivity, setQueryIdActivity] = useState("");
  const [pollingInterval, setPollingInterval] = useState(15);

  const loadConnection = useCallback(async () => {
    const res = await fetch("/api/ibkr/connection");
    if (res.ok) {
      const json = await res.json();
      if (json.connection) {
        const c: ConnectionStatus = json.connection;
        setConn(c);
        setQueryIdTrades(c.flexQueryIdTrades ?? "");
        setQueryIdActivity(c.flexQueryIdActivity ?? "");
        setPollingInterval(c.pollingIntervalMin ?? 15);
        setPricePollingInterval(c.pricePollingIntervalMin ?? 15);
        setBackfillStatus(c.lastBackfillStatus ?? null);
        setBackfillError(c.lastBackfillError ?? null);
      }
    }
  }, []);

  useEffect(() => { loadConnection(); }, [loadConnection]);

  // Poll backfill status while running
  useEffect(() => {
    if (backfillStatus !== "RUNNING") return;
    const interval = setInterval(async () => {
      const res = await fetch("/api/ibkr/backfill");
      if (res.ok) {
        const json = await res.json();
        setBackfillStatus(json.status);
        setBackfillError(json.error ?? null);
        if (json.status !== "RUNNING") {
          clearInterval(interval);
          loadConnection();
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [backfillStatus, loadConnection]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch("/api/ibkr/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flexToken,
          flexQueryIdTrades: queryIdTrades,
          flexQueryIdActivity: queryIdActivity,
          pollingIntervalMin: pollingInterval,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(typeof json.error === "string" ? json.error : JSON.stringify(json.error));
      } else {
        setSaveOk(true);
        setFlexToken("");
        loadConnection();
        setTimeout(() => setSaveOk(false), 3000);
      }
    } catch {
      setSaveError("שגיאת רשת");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res = await fetch("/api/ibkr/test-connection", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setTestError(json.error ?? "שגיאה");
      } else {
        setTestResult(json);
        if (json.firstSuccess) {
          // Auto-prompt user to backfill
          setGuideOpen(false);
        }
      }
    } catch {
      setTestError("שגיאת רשת");
    } finally {
      setTesting(false);
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillError(null);
    try {
      const res = await fetch("/api/ibkr/backfill", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setBackfillError(json.error ?? "שגיאה");
      } else {
        setBackfillStatus("RUNNING");
      }
    } catch {
      setBackfillError("שגיאת רשת");
    } finally {
      setBackfilling(false);
    }
  }

  async function handleSavePrice(e: React.FormEvent) {
    e.preventDefault();
    setSavingPrice(true);
    setSavePriceError(null);
    setSavePriceOk(false);
    try {
      const res = await fetch("/api/polygon/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricePollingIntervalMin: pricePollingInterval }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSavePriceError(typeof json.error === "string" ? json.error : JSON.stringify(json.error));
      } else {
        setSavePriceOk(true);
        loadConnection();
        setTimeout(() => setSavePriceOk(false), 3000);
      }
    } catch {
      setSavePriceError("שגיאת רשת");
    } finally {
      setSavingPrice(false);
    }
  }

  const syncStatusColor =
    conn?.lastSyncStatus === "SUCCESS"
      ? "text-[#2CC84A]"
      : conn?.lastSyncStatus === "ERROR"
      ? "text-[#FF4D4D]"
      : "text-[#888888]";

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-[#E0E0E0]">הגדרות</h1>

      {/* ── IBKR Connection ── */}
      <div className="panel p-6">
        <h2 className="text-base font-medium text-[#E0E0E0] mb-4">חיבור IBKR — Flex Web Service</h2>

        <SetupGuide open={guideOpen} onToggle={() => setGuideOpen((o) => !o)} />

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm text-[#888888] mb-1">Flex Token</label>
            <input
              type="password"
              value={flexToken}
              onChange={(e) => setFlexToken(e.target.value)}
              placeholder={conn ? "••••••••  (השאר ריק לשמור token קיים)" : "הדבק את ה-Flex Token כאן"}
              className="w-full bg-[#111111] border border-[#222222] rounded px-3 py-2 text-sm text-[#E0E0E0] placeholder-[#555555] focus:outline-none focus:border-[#FFB800] font-mono"
            />
          </div>

          <div>
            <label className="block text-sm text-[#888888] mb-1">Query ID — Trade Confirmations (Query 1)</label>
            <input
              type="text"
              value={queryIdTrades}
              onChange={(e) => setQueryIdTrades(e.target.value)}
              placeholder="123456"
              className="w-full bg-[#111111] border border-[#222222] rounded px-3 py-2 text-sm text-[#E0E0E0] placeholder-[#555555] focus:outline-none focus:border-[#FFB800] font-mono"
            />
          </div>

          <div>
            <label className="block text-sm text-[#888888] mb-1">Query ID — Activity (Query 2)</label>
            <input
              type="text"
              value={queryIdActivity}
              onChange={(e) => setQueryIdActivity(e.target.value)}
              placeholder="789012"
              className="w-full bg-[#111111] border border-[#222222] rounded px-3 py-2 text-sm text-[#E0E0E0] placeholder-[#555555] focus:outline-none focus:border-[#FFB800] font-mono"
            />
          </div>

          <div>
            <label className="block text-sm text-[#888888] mb-1">
              מרווח polling (דקות) — מינימום 15
            </label>
            <input
              type="number"
              min={15}
              value={pollingInterval}
              onChange={(e) => setPollingInterval(Math.max(15, parseInt(e.target.value) || 15))}
              className="w-32 bg-[#111111] border border-[#222222] rounded px-3 py-2 text-sm text-[#E0E0E0] focus:outline-none focus:border-[#FFB800] font-mono"
            />
          </div>

          {saveError && <p className="text-[#FF4D4D] text-sm">{saveError}</p>}
          {saveOk && <p className="text-[#2CC84A] text-sm">נשמר בהצלחה ✓</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#FFB800] text-black text-sm font-medium rounded hover:bg-[#e6a600] disabled:opacity-50 transition-colors"
            >
              {saving ? "שומר..." : "שמור"}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !conn}
              className="px-4 py-2 border border-[#222222] text-[#E0E0E0] text-sm rounded hover:border-[#444444] disabled:opacity-40 transition-colors"
            >
              {testing ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> בודק...
                </span>
              ) : (
                "Test Connection"
              )}
            </button>
          </div>
        </form>

        {/* Test results */}
        {testError && <p className="mt-3 text-[#FF4D4D] text-sm">{testError}</p>}
        {testResult && (
          <div className="mt-4 space-y-2">
            <QueryStatusRow label="Query 1 — Trade Confirmations" result={testResult.query1} />
            <QueryStatusRow label="Query 2 — Activity" result={testResult.query2} />
            {testResult.firstSuccess && (
              <div className="mt-3 p-3 border border-[#2CC84A] rounded text-sm text-[#2CC84A]">
                חיבור ראשוני הצליח! מומלץ להריץ Backfill היסטורי עכשיו ↓
              </div>
            )}
          </div>
        )}

        {/* Sync status */}
        {conn && (
          <div className="mt-6 pt-4 border-t border-[#222222] space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#888888]">סנכרון אחרון</span>
              <span className={syncStatusColor}>
                {formatRelativeTime(conn.lastSyncAt)}{" "}
                {conn.lastSyncStatus && `(${conn.lastSyncStatus})`}
              </span>
            </div>
            {conn.lastSyncError && (
              <p className="text-[#FF4D4D] text-xs">{conn.lastSyncError}</p>
            )}
            <div className="flex justify-between">
              <span className="text-[#888888]">Backfill אחרון</span>
              <span
                className={
                  conn.lastBackfillStatus === "SUCCESS"
                    ? "text-[#2CC84A]"
                    : conn.lastBackfillStatus === "ERROR"
                    ? "text-[#FF4D4D]"
                    : "text-[#888888]"
                }
              >
                {formatRelativeTime(conn.lastBackfillAt)}{" "}
                {conn.lastBackfillStatus && conn.lastBackfillStatus !== "RUNNING"
                  ? `(${conn.lastBackfillStatus})`
                  : ""}
              </span>
            </div>

            <div className="pt-2">
              {backfillStatus === "RUNNING" ? (
                <span className="flex items-center gap-2 text-[#FFB800] text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  Backfill רץ...
                </span>
              ) : (
                <button
                  onClick={handleBackfill}
                  disabled={backfilling || !conn}
                  className="px-3 py-1.5 border border-[#222222] text-[#888888] text-xs rounded hover:border-[#444444] hover:text-[#E0E0E0] disabled:opacity-40 transition-colors"
                >
                  Run Activity Backfill
                </button>
              )}
              {backfillError && (
                <p className="mt-1 text-[#FF4D4D] text-xs">{backfillError}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Polygon Price Updates ── */}
      <div className="panel p-6">
        <h2 className="text-base font-medium text-[#E0E0E0] mb-4">עדכון מחירים (Polygon)</h2>

        <form onSubmit={handleSavePrice} className="space-y-4">
          <div>
            <label className="block text-sm text-[#888888] mb-1">
              מרווח עדכון מחירים (דקות) — מינימום 15
            </label>
            <input
              type="number"
              min={15}
              value={pricePollingInterval}
              onChange={(e) =>
                setPricePollingInterval(Math.max(15, parseInt(e.target.value) || 15))
              }
              className="w-32 bg-[#111111] border border-[#222222] rounded px-3 py-2 text-sm text-[#E0E0E0] focus:outline-none focus:border-[#FFB800] font-mono"
            />
            <p className="mt-1 text-xs text-[#555555]">
              עצמאי ממרווח ה-IBKR. ממשיכים לעדכן מחירים גם כשאין עסקאות חדשות.
            </p>
          </div>

          {savePriceError && <p className="text-[#FF4D4D] text-sm">{savePriceError}</p>}
          {savePriceOk && <p className="text-[#2CC84A] text-sm">נשמר בהצלחה ✓</p>}

          <button
            type="submit"
            disabled={savingPrice || !conn}
            className="px-4 py-2 bg-[#FFB800] text-black text-sm font-medium rounded hover:bg-[#e6a600] disabled:opacity-50 transition-colors"
          >
            {savingPrice ? "שומר..." : "שמור"}
          </button>
        </form>

        {/* Price sync status */}
        {conn && (
          <div className="mt-6 pt-4 border-t border-[#222222] space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#888888]">עדכון מחירים אחרון</span>
              <span
                className={
                  conn.lastPriceSyncStatus === "SUCCESS"
                    ? "text-[#2CC84A]"
                    : conn.lastPriceSyncStatus === "ERROR"
                    ? "text-[#FF4D4D]"
                    : "text-[#888888]"
                }
              >
                {formatRelativeTime(conn.lastPriceSyncAt)}{" "}
                {conn.lastPriceSyncStatus && `(${conn.lastPriceSyncStatus})`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── AI (Phase 7 stub) ── */}
      <div className="panel p-6">
        <h2 className="text-base font-medium text-[#E0E0E0] mb-2">AI — חנן</h2>
        <p className="text-[#888888] text-sm">הגדרות מודל — Phase 7</p>
      </div>

      {/* ── Display (Phase 8 stub) ── */}
      <div className="panel p-6">
        <h2 className="text-base font-medium text-[#E0E0E0] mb-2">תצוגה</h2>
        <p className="text-[#888888] text-sm">מטבע, אזור זמן, מצב תצוגה — Phase 8</p>
      </div>
    </div>
  );
}

function QueryStatusRow({ label, result }: { label: string; result: TestResult }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {result.ok ? (
        <CheckCircle size={14} className="text-[#2CC84A] shrink-0" />
      ) : (
        <XCircle size={14} className="text-[#FF4D4D] shrink-0" />
      )}
      <span className={result.ok ? "text-[#E0E0E0]" : "text-[#FF4D4D]"}>{label}</span>
      {!result.ok && result.error && (
        <span className="text-[#555555] text-xs truncate">{result.error}</span>
      )}
    </div>
  );
}
