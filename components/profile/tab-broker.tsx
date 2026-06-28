"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { CountdownCircle } from "./countdown-circle";
import { ProRequiredBanner } from "@/components/billing/pro-required-banner";
import type { SubscriptionTier } from "@/lib/billing/tier";

const TOAST_DURATION = 10;

const REQUIRED_FIELDS = [
  "ClientAccountID", "CurrencyPrimary", "AssetClass", "Symbol",
  "OrderID", "ExecID", "OrderTime", "Date/Time",
  "Buy/Sell", "Quantity", "Price", "NetCash",
  "Commission", "CommissionCurrency", "OrderType",
];

interface ConnectionStatus {
  id?: string;
  flexQueryIdActivity?: string;
  pricePollingIntervalMin?: number;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
}

interface ActivityTestResult {
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

function SetupGuide({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="border border-border rounded-md mb-6">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-4 text-right text-sm font-medium text-text-main hover:bg-input-bg transition-colors"
      >
        <span className="flex items-center gap-2 text-amber">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          מדריך הגדרה — Flex Web Service
        </span>
      </button>
      {open && (
        <div className="p-4 border-t border-border space-y-4 text-sm text-text-dim">
          <div>
            <p className="text-text-main font-medium mb-1">שלב 1 — הפעלת Flex Web Service</p>
            <p>
              ב-IBKR Portal:{" "}
              <span className="text-text-main">Settings → Account Settings → Reports → Flex Web Service</span>
              {" "}→ לחץ "Enable" וקבל את ה-Token.
            </p>
          </div>
          <div>
            <p className="text-text-main font-medium mb-1">שלב 2 — יצירת Activity Flex Query</p>
            <p>
              ב-IBKR Portal:{" "}
              <span className="text-text-main">Reports → Flex Queries → Create New → Activity</span>
              <br />
              טווח: <span className="text-text-main">Last 90 Days</span> (או יותר לסנכרון ראשוני)
              <br />
              פורמט תאריך: <span className="font-mono text-green">dd/MM/yyyy</span> — פורמט שעה:{" "}
              <span className="font-mono text-green">HH:mm:ss TimeZone</span>
            </p>
          </div>
          <div>
            <p className="text-text-main font-medium mb-2">15 השדות הנדרשים:</p>
            <div className="grid grid-cols-2 gap-1">
              {REQUIRED_FIELDS.map((f) => (
                <span key={f} className="font-mono text-xs text-green bg-green-tint px-2 py-1 rounded">
                  {f}
                </span>
              ))}
            </div>
          </div>
          <p className="text-sm text-text-dim">
            שלב 3: העתק את ה-Token ואת ה-Query ID לשדות למטה.
          </p>
        </div>
      )}
    </div>
  );
}

function QueryStatusRow({ label, result }: { label: string; result: ActivityTestResult }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {result.ok ? (
        <CheckCircle size={14} className="text-green shrink-0" />
      ) : (
        <XCircle size={14} className="text-red shrink-0" />
      )}
      <span className={result.ok ? "text-text-main" : "text-red"}>{label}</span>
      {!result.ok && result.error && (
        <span className="text-text-dim text-sm truncate">{result.error}</span>
      )}
    </div>
  );
}

interface TabBrokerProps {
  userTier: SubscriptionTier;
}

export function TabBroker({ userTier }: TabBrokerProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [toastSecondsLeft, setToastSecondsLeft] = useState(0);
  const [testResult, setTestResult] = useState<{ activity: ActivityTestResult; firstSuccess?: boolean } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnectionStatus | null>(null);
  const [initialSyncRunning, setInitialSyncRunning] = useState(false);
  const lastSyncAtBeforeSave = useRef<string | null>(null);

  const [flexToken, setFlexToken] = useState("");
  const [queryIdActivity, setQueryIdActivity] = useState("");

  const loadConnection = useCallback(async () => {
    const res = await fetch("/api/ibkr/connection");
    if (res.ok) {
      const json = await res.json();
      if (json.connection) {
        const c: ConnectionStatus = json.connection;
        setConn(c);
        setQueryIdActivity(c.flexQueryIdActivity ?? "");
      }
    }
  }, []);

  useEffect(() => { loadConnection(); }, [loadConnection]);

  useEffect(() => {
    if (!saveOk) return;
    setToastSecondsLeft(TOAST_DURATION);
    const interval = setInterval(() => {
      setToastSecondsLeft((prev) => {
        if (prev <= 1) { clearInterval(interval); setSaveOk(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [saveOk]);

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
          }
          clearInterval(interval);
          return;
        }
      }
      if (elapsed >= 120) { setInitialSyncRunning(false); clearInterval(interval); }
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
        body: JSON.stringify({ flexToken, flexQueryIdActivity: queryIdActivity }),
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
        if (json.firstSuccess) setGuideOpen(false);
      }
    } catch {
      setTestError("שגיאת רשת");
    } finally {
      setTesting(false);
    }
  }

  async function handleExportCsv() {
    setExportingCsv(true);
    setExportError(null);
    try {
      const res = await fetch("/api/export/activity-csv");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setExportError(json.error ?? "שגיאה בייצוא CSV");
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
      setExportError("שגיאת רשת בייצוא CSV");
    } finally {
      setExportingCsv(false);
    }
  }

  const syncStatusColor =
    conn?.lastSyncStatus === "SUCCESS" ? "text-green" :
    conn?.lastSyncStatus === "ERROR" ? "text-red" :
    "text-text-dim";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-main">ברוקר — IBKR</h2>
        <p className="text-sm text-text-dim mt-1">חיבור ל-Interactive Brokers דרך Flex Web Service</p>
      </div>

      {userTier === "Free" && <ProRequiredBanner feature="סנכרון אוטומטי מ-IBKR" />}

      <div className="panel p-6">
        <h3 className="text-sm font-medium text-text-main mb-4">Flex Web Service</h3>

        <SetupGuide open={guideOpen} onToggle={() => setGuideOpen((o) => !o)} />

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm text-text-dim mb-1">Flex Token</label>
            <input
              type="password"
              value={flexToken}
              onChange={(e) => setFlexToken(e.target.value)}
              placeholder={conn ? "••••••••  (נדרש להזין מחדש לשינויים)" : "הדבק את ה-Flex Token כאן"}
              className="w-full bg-panel border border-border rounded px-3 py-2 text-sm text-text-main placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 focus:border-amber font-mono"
            />
          </div>

          <div>
            <label className="block text-sm text-text-dim mb-1">Query ID — Activity</label>
            <input
              type="text"
              value={queryIdActivity}
              onChange={(e) => setQueryIdActivity(e.target.value)}
              placeholder="123456"
              className="w-full bg-panel border border-border rounded px-3 py-2 text-sm text-text-main placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 focus:border-amber font-mono"
            />
          </div>

          {saveError && <p className="text-red text-sm">{saveError}</p>}

          {saveOk && (
            <div className="flex items-center gap-2 text-green text-sm">
              <CountdownCircle remaining={toastSecondsLeft} total={TOAST_DURATION} />
              <span>נשמר בהצלחה ✓</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-amber text-black text-sm font-medium rounded hover:bg-amber-dark disabled:opacity-50 transition-colors"
            >
              {saving ? "שומר..." : "שמור"}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !conn}
              className="px-4 py-2 border border-border text-text-main text-sm rounded hover:border-shade-2 disabled:opacity-40 transition-colors"
            >
              {testing ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> בודק...
                </span>
              ) : "Test Connection"}
            </button>
          </div>
        </form>

        {testError && <p className="mt-3 text-red text-sm">{testError}</p>}
        {testResult && (
          <div className="mt-4 space-y-2">
            <QueryStatusRow label="Activity Flex Query" result={testResult.activity} />
          </div>
        )}

        {conn && (
          <div className="mt-6 pt-4 border-t border-border space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-dim">סנכרון אחרון</span>
              <span className={initialSyncRunning ? "text-amber" : syncStatusColor}>
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
              <p className="text-red text-xs">{conn.lastSyncError}</p>
            )}
            <div className="pt-2 space-y-2">
              <button
                onClick={handleExportCsv}
                disabled={exportingCsv || !conn}
                className="px-3 py-1.5 border border-border text-text-dim text-sm rounded hover:border-shade-2 hover:text-text-main disabled:opacity-40 transition-colors"
              >
                {exportingCsv ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> מייצא...
                  </span>
                ) : "ייצא Activity כ-CSV"}
              </button>
              {exportError && (
                <p role="alert" className="text-red text-xs border border-red/30 bg-red/5 rounded px-3 py-2">
                  {exportError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
