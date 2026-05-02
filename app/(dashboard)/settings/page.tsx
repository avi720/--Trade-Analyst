"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2 } from "lucide-react";

const TOAST_DURATION = 10;

// The required IBKR Flex fields for the Activity report
const REQUIRED_FIELDS = [
  "ClientAccountID", "CurrencyPrimary", "AssetClass", "Symbol",
  "TradeID", "OrderID", "ExecID", "OrderTime", "Date/Time", "TradeDate",
  "Exchange", "Buy/Sell", "Quantity", "Price", "Proceeds", "NetCash",
  "Commission", "CommissionCurrency", "Tax", "OrderType",
];

interface ConnectionStatus {
  id?: string;
  flexQueryIdActivity?: string;
  pollingIntervalMin?: number;
  pricePollingIntervalMin?: number;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastPriceSyncAt?: string | null;
  lastPriceSyncStatus?: string | null;
}

interface ActivityTestResult {
  ok: boolean;
  error?: string;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso + "Z").getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  return new Date(iso).toLocaleDateString("he-IL");
}

function CountdownCircle({ remaining, total }: { remaining: number; total: number }) {
  const r = 5;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - remaining / total);
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx="7" cy="7" r={r} fill="none" stroke="#1a3a1a" strokeWidth="2" />
      <circle
        cx="7" cy="7" r={r}
        fill="none"
        stroke="#2CC84A"
        strokeWidth="2"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
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
            <p className="text-[#E0E0E0] font-medium mb-1">שלב 2 — יצירת Activity Flex Query</p>
            <p>
              ב-IBKR Portal:{" "}
              <span className="text-[#E0E0E0]">Reports → Flex Queries → Create New → Activity</span>
              <br />
              טווח: <span className="text-[#E0E0E0]">Last 90 Days</span> (או יותר לסנכרון ראשוני)
              <br />
              פורמט תאריך: <span className="font-mono text-[#2CC84A]">dd/MM/yyyy</span> — פורמט שעה:{" "}
              <span className="font-mono text-[#2CC84A]">HH:mm:ss TimeZone</span>
            </p>
          </div>
          <div>
            <p className="text-[#E0E0E0] font-medium mb-2">
              20 השדות הנדרשים:
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
            שלב 3: העתק את ה-Token ואת ה-Query ID לשדות למטה.
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
  const [exportingCsv, setExportingCsv] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [toastSecondsLeft, setToastSecondsLeft] = useState(0);
  const [testResult, setTestResult] = useState<{ activity: ActivityTestResult; firstSuccess?: boolean } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnectionStatus | null>(null);
  const [initialSyncRunning, setInitialSyncRunning] = useState(false);
  const lastSyncAtBeforeSave = useRef<string | null>(null);

  // IBKR form state
  const [flexToken, setFlexToken] = useState("");
  const [queryIdActivity, setQueryIdActivity] = useState("");
  const [pollingInterval, setPollingInterval] = useState(720);

  const loadConnection = useCallback(async () => {
    const res = await fetch("/api/ibkr/connection");
    if (res.ok) {
      const json = await res.json();
      if (json.connection) {
        const c: ConnectionStatus = json.connection;
        setConn(c);
        setQueryIdActivity(c.flexQueryIdActivity ?? "");
        setPollingInterval(c.pollingIntervalMin ?? 720);
      }
    }
  }, []);

  useEffect(() => { loadConnection(); }, [loadConnection]);

  // Toast countdown — 10 seconds with circle
  useEffect(() => {
    if (!saveOk) return;
    setToastSecondsLeft(TOAST_DURATION);
    const interval = setInterval(() => {
      setToastSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setSaveOk(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [saveOk]);

  // Poll until initial sync completes (lastSyncAt changes)
  useEffect(() => {
    if (!initialSyncRunning) return;
    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += 2;
      const res = await fetch("/api/ibkr/connection");
      if (res.ok) {
        const json = await res.json();
        const newSyncAt: string | null = json.connection?.lastSyncAt ?? null;
        if (newSyncAt && newSyncAt !== lastSyncAtBeforeSave.current) {
          setInitialSyncRunning(false);
          if (json.connection) {
            setConn(json.connection);
            setQueryIdActivity(json.connection.flexQueryIdActivity ?? "");
            setPollingInterval(json.connection.pollingIntervalMin ?? 720);
          }
          clearInterval(interval);
          return;
        }
      }
      if (elapsed >= 120) {
        setInitialSyncRunning(false);
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [initialSyncRunning]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    lastSyncAtBeforeSave.current = conn?.lastSyncAt ?? null;
    try {
      const res = await fetch("/api/ibkr/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flexToken,
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
        setInitialSyncRunning(true);
        loadConnection();
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
          setGuideOpen(false);
        }
      }
    } catch {
      setTestError("שגיאת רשת");
    } finally {
      setTesting(false);
    }
  }

  async function handleExportCsv() {
    setExportingCsv(true);
    try {
      const res = await fetch("/api/export/activity-csv");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? "שגיאה בייצוא CSV");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("שגיאת רשת בייצוא CSV");
    } finally {
      setExportingCsv(false);
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
              placeholder={conn ? "••••••••  (נדרש להזין מחדש לשינויים)" : "הדבק את ה-Flex Token כאן"}
              className="w-full bg-[#111111] border border-[#222222] rounded px-3 py-2 text-sm text-[#E0E0E0] placeholder-[#555555] focus:outline-none focus:border-[#FFB800] font-mono"
            />
          </div>

          <div>
            <label className="block text-sm text-[#888888] mb-1">Query ID — Activity</label>
            <input
              type="text"
              value={queryIdActivity}
              onChange={(e) => setQueryIdActivity(e.target.value)}
              placeholder="123456"
              className="w-full bg-[#111111] border border-[#222222] rounded px-3 py-2 text-sm text-[#E0E0E0] placeholder-[#555555] focus:outline-none focus:border-[#FFB800] font-mono"
            />
          </div>

          {saveError && <p className="text-[#FF4D4D] text-sm">{saveError}</p>}

          {saveOk && (
            <div className="flex items-center gap-2 text-[#2CC84A] text-sm">
              <CountdownCircle remaining={toastSecondsLeft} total={TOAST_DURATION} />
              <span>נשמר בהצלחה ✓</span>
            </div>
          )}

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
            <QueryStatusRow label="Activity Flex Query" result={testResult.activity} />
          </div>
        )}

        {/* Sync status */}
        {conn && (
          <div className="mt-6 pt-4 border-t border-[#222222] space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#888888]">סנכרון אחרון</span>
              <span className={initialSyncRunning ? "text-[#FFB800]" : syncStatusColor}>
                {initialSyncRunning ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin inline" />
                    סנכרון ראשוני מתבצע...
                  </span>
                ) : (
                  <>
                    {formatRelativeTime(conn.lastSyncAt)}{" "}
                    {conn.lastSyncStatus && `(${conn.lastSyncStatus})`}
                  </>
                )}
              </span>
            </div>
            {conn.lastSyncError && !initialSyncRunning && (
              <p className="text-[#FF4D4D] text-xs">{conn.lastSyncError}</p>
            )}

            <div className="pt-2">
              <button
                onClick={handleExportCsv}
                disabled={exportingCsv || !conn}
                className="px-3 py-1.5 border border-[#222222] text-[#888888] text-xs rounded hover:border-[#444444] hover:text-[#E0E0E0] disabled:opacity-40 transition-colors"
              >
                {exportingCsv ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> מייצא...
                  </span>
                ) : (
                  "ייצא Activity כ-CSV"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── AI (Phase 7 stub) ── */}
      <div className="panel p-6">
        <h2 className="text-base font-medium text-[#E0E0E0] mb-2">AI — חנן</h2>
        <p className="text-[#888888] text-sm">הגדרות מודל — Phase 7</p>
      </div>

      {/* ── Display ── */}
      <div className="panel p-6">
        <h2 className="text-base font-medium text-[#E0E0E0] mb-2">תצוגה</h2>
        <p className="text-[#888888] text-sm">מטבע, אזור זמן, מצב תצוגה</p>
      </div>
    </div>
  );
}

function QueryStatusRow({ label, result }: { label: string; result: ActivityTestResult }) {
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
