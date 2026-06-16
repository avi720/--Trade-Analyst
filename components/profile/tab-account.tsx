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
  "w-full bg-panel-2 border border-border rounded-md px-3 py-2.5 text-sm text-text-main placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 focus:border-amber transition-colors";

const labelCls = "block text-xs font-medium text-text-dim mb-1.5 uppercase tracking-wider";

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
        <h2 className="text-lg font-semibold text-text-main">פרטים אישיים</h2>
        <p className="text-sm text-text-dim mt-1">שם, פרטי קשר וכתובת מגורים</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Email — read-only */}
        <div className="panel p-5">
          <h3 className="text-xs font-medium text-text-dim uppercase tracking-wider mb-4">כתובת אימייל</h3>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-text-main font-mono">{userEmail}</p>
            <button
              type="button"
              onClick={() => router.push("/profile?tab=security")}
              className="text-xs text-amber hover:text-amber-dark transition-colors whitespace-nowrap"
            >
              שינוי אימייל ←
            </button>
          </div>
        </div>

        {/* Name */}
        <div className="panel p-5">
          <h3 className="text-xs font-medium text-text-dim uppercase tracking-wider mb-4">שם</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-first-name" className={labelCls}>שם פרטי</label>
              <input
                id="profile-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="ישראל"
                className={inputCls}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label htmlFor="profile-last-name" className={labelCls}>שם משפחה</label>
              <input
                id="profile-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="ישראלי"
                className={inputCls}
                autoComplete="family-name"
              />
            </div>
          </div>
          {initialName && (
            <p className="mt-3 text-sm text-text-dim">שם תצוגה נוכחי: <span className="text-text-dim">{initialName}</span></p>
          )}
        </div>

        {/* Contact */}
        <div className="panel p-5">
          <h3 className="text-xs font-medium text-text-dim uppercase tracking-wider mb-4">פרטי קשר</h3>
          <div>
            <label htmlFor="profile-phone" className={labelCls}>מספר טלפון</label>
            <input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+972-50-000-0000"
              className={inputCls}
              dir="ltr"
              autoComplete="tel"
            />
          </div>
        </div>

        {/* Address */}
        <div className="panel p-5">
          <h3 className="text-xs font-medium text-text-dim uppercase tracking-wider mb-4">כתובת מגורים</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="profile-street" className={labelCls}>רחוב ומספר</label>
              <input
                id="profile-street"
                type="text"
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                placeholder="רחוב הרצל 1"
                className={inputCls}
                autoComplete="street-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="profile-city" className={labelCls}>עיר</label>
                <input
                  id="profile-city"
                  type="text"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  placeholder="תל אביב"
                  className={inputCls}
                  autoComplete="address-level2"
                />
              </div>
              <div>
                <label htmlFor="profile-country" className={labelCls}>מדינה</label>
                <input
                  id="profile-country"
                  type="text"
                  value={addressCountry}
                  onChange={(e) => setAddressCountry(e.target.value)}
                  placeholder="ישראל"
                  className={inputCls}
                  autoComplete="country-name"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Save */}
        {saveError && <p className="text-red text-sm">{saveError}</p>}
        {saveOk && (
          <div className="flex items-center gap-2 text-green text-sm">
            <CountdownCircle remaining={toastSecondsLeft} total={TOAST_DURATION} />
            <span>הפרופיל עודכן בהצלחה ✓</span>
          </div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-amber text-black text-sm font-semibold rounded-md hover:bg-amber-dark disabled:opacity-50 transition-colors"
        >
          {saving ? "שומר..." : "שמור שינויים"}
        </button>
      </form>
    </div>
  );
}
