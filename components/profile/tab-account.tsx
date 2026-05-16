"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CountdownCircle } from "./countdown-circle";

const TOAST_DURATION = 10;

interface UserProfile {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressCountry: string | null;
}

interface TabAccountProps {
  userEmail: string;
  initialName: string | null;
  initialProfile: UserProfile;
}

const inputCls =
  "w-full bg-[#0d0d0d] border border-[#222222] rounded-md px-3 py-2.5 text-sm text-[#E0E0E0] placeholder-[#444444] focus:outline-none focus:border-[#FFB800] transition-colors";

const labelCls = "block text-xs font-medium text-[#888888] mb-1.5 uppercase tracking-wider";

export function TabAccount({ userEmail, initialName, initialProfile }: TabAccountProps) {
  const router = useRouter();

  const [firstName, setFirstName] = useState(initialProfile.firstName ?? "");
  const [lastName, setLastName] = useState(initialProfile.lastName ?? "");
  const [phone, setPhone] = useState(initialProfile.phone ?? "");
  const [addressStreet, setAddressStreet] = useState(initialProfile.addressStreet ?? "");
  const [addressCity, setAddressCity] = useState(initialProfile.addressCity ?? "");
  const [addressCountry, setAddressCountry] = useState(initialProfile.addressCountry ?? "");

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
      const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || null;
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: displayName,
          firstName,
          lastName,
          phone,
          addressStreet,
          addressCity,
          addressCountry,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "שגיאה בשמירה");
      } else {
        setSaveOk(true);
        router.refresh();
      }
    } catch {
      setSaveError("שגיאת רשת");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#E0E0E0]">פרטים אישיים</h2>
        <p className="text-sm text-[#888888] mt-1">שם, פרטי קשר וכתובת מגורים</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Email — read-only */}
        <div className="panel p-5">
          <h3 className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-4">כתובת אימייל</h3>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[#E0E0E0] font-mono">{userEmail}</p>
            <button
              type="button"
              onClick={() => router.push("/profile?tab=security")}
              className="text-xs text-[#FFB800] hover:text-[#e6a600] transition-colors whitespace-nowrap"
            >
              שינוי אימייל ←
            </button>
          </div>
        </div>

        {/* Name */}
        <div className="panel p-5">
          <h3 className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-4">שם</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>שם פרטי</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="ישראל"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>שם משפחה</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="ישראלי"
                className={inputCls}
              />
            </div>
          </div>
          {initialName && (
            <p className="mt-3 text-xs text-[#555555]">שם תצוגה נוכחי: <span className="text-[#888888]">{initialName}</span></p>
          )}
        </div>

        {/* Contact */}
        <div className="panel p-5">
          <h3 className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-4">פרטי קשר</h3>
          <div>
            <label className={labelCls}>מספר טלפון</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+972-50-000-0000"
              className={inputCls}
              dir="ltr"
            />
          </div>
        </div>

        {/* Address */}
        <div className="panel p-5">
          <h3 className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-4">כתובת מגורים</h3>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>רחוב ומספר</label>
              <input
                type="text"
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                placeholder="רחוב הרצל 1"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>עיר</label>
                <input
                  type="text"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  placeholder="תל אביב"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>מדינה</label>
                <input
                  type="text"
                  value={addressCountry}
                  onChange={(e) => setAddressCountry(e.target.value)}
                  placeholder="ישראל"
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Save */}
        {saveError && <p className="text-[#FF4D4D] text-sm">{saveError}</p>}
        {saveOk && (
          <div className="flex items-center gap-2 text-[#2CC84A] text-sm">
            <CountdownCircle remaining={toastSecondsLeft} total={TOAST_DURATION} />
            <span>הפרופיל עודכן בהצלחה ✓</span>
          </div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-[#FFB800] text-black text-sm font-semibold rounded-md hover:bg-[#e6a600] disabled:opacity-50 transition-colors"
        >
          {saving ? "שומר..." : "שמור שינויים"}
        </button>
      </form>
    </div>
  );
}
