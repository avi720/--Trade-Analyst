"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertTriangle } from "lucide-react";
import { AuditActivity } from "./audit-activity";

const inputCls =
  "w-full bg-panel-2 border border-border rounded-md px-3 py-2.5 text-sm text-text-main placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 focus:border-amber transition-colors font-mono";

const labelCls = "block text-xs font-medium text-text-dim mb-1.5 uppercase tracking-wider";

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-green text-sm bg-green-tint border border-green/20 rounded-md px-4 py-3">
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {message}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="text-red text-sm">{message}</p>
  );
}

function PasswordInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls + " pl-10"}
        dir="ltr"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-dim transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export function TabSecurity({ userEmail }: { userEmail: string }) {
  const router = useRouter();

  // Email section
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailOk, setEmailOk] = useState(false);

  // Password section
  const [pwCurrentPassword, setPwCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  // Delete account
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteCurrentPassword, setDeleteCurrentPassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleEmailChange(e: React.FormEvent) {
    e.preventDefault();
    setEmailSaving(true);
    setEmailError(null);
    setEmailOk(false);
    try {
      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: emailCurrentPassword, newEmail }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmailError(json.error ?? "שגיאה");
      } else {
        setEmailOk(true);
        setNewEmail("");
        setEmailCurrentPassword("");
      }
    } catch {
      setEmailError("שגיאת רשת");
    } finally {
      setEmailSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError("הסיסמאות אינן תואמות");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    setPwSaving(true);
    setPwError(null);
    setPwOk(false);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPwError(json.error ?? "שגיאה");
      } else {
        setPwOk(true);
        setNewPassword("");
        setConfirmPassword("");
        setPwCurrentPassword("");
      }
    } catch {
      setPwError("שגיאת רשת");
    } finally {
      setPwSaving(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: deleteCurrentPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDeleteError(json.error ?? "שגיאה במחיקת החשבון");
        return;
      }
      await supabase.auth.signOut();
      router.push("/login");
    } catch {
      setDeleteError("שגיאת רשת");
    } finally {
      setDeleteLoading(false);
    }
  }

  const strengthScore = newPassword.length >= 12 ? 3 : newPassword.length >= 8 ? 2 : newPassword.length > 0 ? 1 : 0;
  const strengthLabel = ["", "חלשה", "בינונית", "חזקה"][strengthScore];
  const strengthColor = ["", "#FF4D4D", "#FFB800", "#2CC84A"][strengthScore];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-main">אבטחה</h2>
        <p className="text-sm text-text-dim mt-1">שינוי אימייל, סיסמה וניהול חשבון</p>
      </div>

      {/* Change email */}
      <div className="panel p-5">
        <h3 className="text-xs font-medium text-text-dim uppercase tracking-wider mb-4">שינוי אימייל</h3>
        <p className="text-sm text-text-dim mb-4">אימייל נוכחי: <span className="text-text-dim font-mono">{userEmail}</span></p>
        <form onSubmit={handleEmailChange} className="space-y-4">
          <div>
            <label className={labelCls}>אימייל חדש</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@example.com"
              className={inputCls}
              dir="ltr"
            />
          </div>
          <div>
            <label className={labelCls}>סיסמה נוכחית</label>
            <PasswordInput value={emailCurrentPassword} onChange={setEmailCurrentPassword} placeholder="הסיסמה הנוכחית שלך" />
          </div>
          {emailError && <ErrorBanner message={emailError} />}
          {emailOk && <SuccessBanner message="האימייל עודכן בהצלחה ✓" />}
          <button
            type="submit"
            disabled={emailSaving || !newEmail || !emailCurrentPassword}
            className="px-5 py-2.5 bg-amber text-black text-sm font-semibold rounded-md hover:bg-amber-dark disabled:opacity-50 transition-colors"
          >
            {emailSaving ? "מעדכן..." : "עדכן אימייל"}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="panel p-5">
        <h3 className="text-xs font-medium text-text-dim uppercase tracking-wider mb-4">שינוי סיסמה</h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className={labelCls}>סיסמה נוכחית</label>
            <PasswordInput value={pwCurrentPassword} onChange={setPwCurrentPassword} placeholder="הסיסמה הנוכחית שלך" />
          </div>
          <div>
            <label className={labelCls}>סיסמה חדשה</label>
            <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="לפחות 8 תווים" />
            {newPassword.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex gap-1">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-1 w-8 rounded-full transition-colors"
                      style={{ backgroundColor: i <= strengthScore ? strengthColor : "#222222" }}
                    />
                  ))}
                </div>
                <span className="text-xs" style={{ color: strengthColor }}>{strengthLabel}</span>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>אישור סיסמה</label>
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="הזן שוב את הסיסמה" />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="mt-1.5 text-xs text-red">הסיסמאות אינן תואמות</p>
            )}
          </div>
          {pwError && <ErrorBanner message={pwError} />}
          {pwOk && <SuccessBanner message="הסיסמה שונתה בהצלחה ✓" />}
          <button
            type="submit"
            disabled={pwSaving || !newPassword || !confirmPassword || !pwCurrentPassword}
            className="px-5 py-2.5 bg-amber text-black text-sm font-semibold rounded-md hover:bg-amber-dark disabled:opacity-50 transition-colors"
          >
            {pwSaving ? "משנה..." : "שנה סיסמה"}
          </button>
        </form>
      </div>

      {/* Audit activity */}
      <AuditActivity />

      {/* Danger zone */}
      <div className="panel p-5 border-red-shade">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={15} className="text-red" />
          <h3 className="text-xs font-medium text-red uppercase tracking-wider">אזור מסוכן</h3>
        </div>

        {!deleteOpen ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-main font-medium">מחיקת חשבון</p>
              <p className="text-sm text-text-dim mt-0.5">פעולה זו בלתי הפיכה. כל הנתונים יימחקו לצמיתות.</p>
            </div>
            <button
              onClick={() => setDeleteOpen(true)}
              className="px-4 py-2 border border-red/40 text-red text-sm rounded-md hover:bg-red/10 transition-colors whitespace-nowrap"
            >
              מחק חשבון
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-main">
              כדי לאשר, הקלד <span className="font-mono text-red bg-red-tint px-1.5 py-0.5 rounded">מחק</span> בשדה למטה והזן את הסיסמה הנוכחית:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="מחק"
              className="w-full bg-panel-2 border border-red/40 rounded-md px-3 py-2.5 text-sm text-text-main placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 focus:border-red transition-colors"
            />
            <div>
              <label className={labelCls}>סיסמה נוכחית</label>
              <PasswordInput value={deleteCurrentPassword} onChange={setDeleteCurrentPassword} placeholder="הסיסמה הנוכחית שלך" />
            </div>
            {deleteError && <ErrorBanner message={deleteError} />}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "מחק" || !deleteCurrentPassword || deleteLoading}
                className="px-4 py-2 bg-red text-white text-sm font-semibold rounded-md hover:bg-red-dark disabled:opacity-40 transition-colors"
              >
                {deleteLoading ? "מוחק..." : "אני מבין, מחק את החשבון"}
              </button>
              <button
                onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); setDeleteCurrentPassword(""); }}
                className="px-4 py-2 border border-border text-text-dim text-sm rounded-md hover:border-shade-2 hover:text-text-main transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
