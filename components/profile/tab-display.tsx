"use client";

import { useState, useEffect } from "react";
import { CountdownCircle } from "./countdown-circle";

const TOAST_DURATION = 10;

interface DisplaySettings {
  currency?: "USD" | "ILS";
  dateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  numberFormat?: "en" | "eu";
}

interface TabDisplayProps {
  initialDisplay: DisplaySettings;
}

const labelCls = "block text-xs font-medium text-[#888888] uppercase tracking-wider mb-3";

function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub?: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
            value === opt.value
              ? "border-[#FFB800]/50 bg-[#1A1200]"
              : "border-[#222222] hover:border-[#333333] hover:bg-[#161616]"
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
              value === opt.value ? "border-[#FFB800]" : "border-[#444444]"
            }`}
          >
            {value === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-[#FFB800]" />}
          </div>
          <input
            type="radio"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <div>
            <span className="text-sm text-[#E0E0E0]">{opt.label}</span>
            {opt.sub && <span className="block text-xs text-[#555555] mt-0.5">{opt.sub}</span>}
          </div>
        </label>
      ))}
    </div>
  );
}

export function TabDisplay({ initialDisplay }: TabDisplayProps) {
  const [currency, setCurrency] = useState<"USD" | "ILS">(initialDisplay.currency ?? "USD");
  const [dateFormat, setDateFormat] = useState<"DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD">(
    initialDisplay.dateFormat ?? "DD/MM/YYYY"
  );
  const [numberFormat, setNumberFormat] = useState<"en" | "eu">(initialDisplay.numberFormat ?? "en");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [toastSecondsLeft, setToastSecondsLeft] = useState(0);

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { display: { currency, dateFormat, numberFormat } } }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "שגיאה בשמירה");
      } else {
        setSaveOk(true);
      }
    } catch {
      setSaveError("שגיאת רשת");
    } finally {
      setSaving(false);
    }
  }

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const dateExamples = {
    "DD/MM/YYYY": `${dd}/${mm}/${yyyy}`,
    "MM/DD/YYYY": `${mm}/${dd}/${yyyy}`,
    "YYYY-MM-DD": `${yyyy}-${mm}-${dd}`,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#E0E0E0]">תצוגה</h2>
        <p className="text-sm text-[#888888] mt-1">מטבע, פורמט תאריכים ומספרים</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Currency */}
        <div className="panel p-5">
          <label className={labelCls}>מטבע ראשי</label>
          <RadioGroup
            value={currency}
            onChange={setCurrency}
            options={[
              { value: "USD", label: "דולר אמריקאי (USD)", sub: "$1,234.56" },
              { value: "ILS", label: "שקל ישראלי (ILS)", sub: "₪1,234.56" },
            ]}
          />
        </div>

        {/* Date format */}
        <div className="panel p-5">
          <label className={labelCls}>פורמט תאריך</label>
          <RadioGroup
            value={dateFormat}
            onChange={setDateFormat}
            options={[
              { value: "DD/MM/YYYY", label: "יום/חודש/שנה", sub: dateExamples["DD/MM/YYYY"] },
              { value: "MM/DD/YYYY", label: "חודש/יום/שנה (אמריקאי)", sub: dateExamples["MM/DD/YYYY"] },
              { value: "YYYY-MM-DD", label: "ISO 8601", sub: dateExamples["YYYY-MM-DD"] },
            ]}
          />
        </div>

        {/* Number format */}
        <div className="panel p-5">
          <label className={labelCls}>פורמט מספרים</label>
          <RadioGroup
            value={numberFormat}
            onChange={setNumberFormat}
            options={[
              { value: "en", label: "אנגלי", sub: "1,234,567.89 — פסיק להפרדת אלפים, נקודה לעשרוני" },
              { value: "eu", label: "אירופאי", sub: "1.234.567,89 — נקודה להפרדת אלפים, פסיק לעשרוני" },
            ]}
          />
        </div>

        {saveError && <p className="text-[#FF4D4D] text-sm">{saveError}</p>}
        {saveOk && (
          <div className="flex items-center gap-2 text-[#2CC84A] text-sm">
            <CountdownCircle remaining={toastSecondsLeft} total={TOAST_DURATION} />
            <span>הגדרות התצוגה עודכנו ✓</span>
          </div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-[#FFB800] text-black text-sm font-semibold rounded-md hover:bg-[#e6a600] disabled:opacity-50 transition-colors"
        >
          {saving ? "שומר..." : "שמור הגדרות תצוגה"}
        </button>
      </form>
    </div>
  );
}
