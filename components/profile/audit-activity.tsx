"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shield, ShieldAlert, ShieldX, Clock, KeyRound, Mail, Trash2, Ban } from "lucide-react";
import type { Tables } from "@/lib/db/types";

type AuditEvent = Tables<"AuditEvent">;

const EVENT_LABELS: Record<string, string> = {
  password_changed: "שינוי סיסמה",
  email_changed: "שינוי אימייל",
  account_deleted: "מחיקת חשבון",
  reauth_failed: "אימות סיסמה נכשל",
  rate_limit_hit: "חרגת ממגבלת בקשות",
};

function eventIcon(eventType: string, status: string) {
  const cls = status === "success" ? "text-green" : "text-red";
  const size = 16;
  switch (eventType) {
    case "password_changed": return <KeyRound size={size} className={cls} />;
    case "email_changed":    return <Mail size={size} className={cls} />;
    case "account_deleted":  return <Trash2 size={size} className={cls} />;
    case "reauth_failed":    return <ShieldAlert size={size} className="text-amber" />;
    case "rate_limit_hit":   return <Ban size={size} className="text-amber" />;
    default:                 return status === "success" ? <Shield size={size} className={cls} /> : <ShieldX size={size} className={cls} />;
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function relativeTime(iso: string): string | null {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "לפני רגע";
  if (min < 60) return `לפני ${min} דק'`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr} ש'`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `לפני ${day} ימים`;
  return null;
}

function metadataPreview(meta: AuditEvent["metadata"]): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof m.action === "string") parts.push(m.action);
  if (typeof m.oldEmail === "string" && typeof m.newEmail === "string") {
    parts.push(`${m.oldEmail} ← ${m.newEmail}`);
  }
  if (typeof m.error === "string") parts.push(`שגיאה: ${m.error.slice(0, 60)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function AuditActivity() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("AuditEvent")
      .select("*")
      .order("createdAt", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          setEvents([]);
        } else {
          setEvents(data ?? []);
        }
      });
  }, []);

  return (
    <div className="panel p-5">
      <h3 className="text-xs font-medium text-text-dim uppercase tracking-wider mb-4">פעילות אחרונה בחשבון</h3>
      <p className="text-sm text-text-dim mb-4">
        50 האירועים האחרונים בחשבונך — שינויי סיסמה ואימייל, ניסיונות אימות שנכשלו וחריגות ממגבלת בקשות.
      </p>

      {events === null && (
        <p className="text-sm text-text-dim flex items-center gap-2">
          <Clock size={14} /> טוען...
        </p>
      )}

      {error && (
        <p className="text-sm text-red">שגיאה בטעינת פעילות: {error}</p>
      )}

      {events && events.length === 0 && !error && (
        <p className="text-sm text-text-dim">אין פעילות לתעד עדיין.</p>
      )}

      {events && events.length > 0 && (
        <ul className="space-y-2">
          {events.map((ev) => {
            const label = EVENT_LABELS[ev.eventType] ?? ev.eventType;
            const meta = metadataPreview(ev.metadata);
            const rel = relativeTime(ev.createdAt);
            return (
              <li
                key={ev.id}
                className="flex items-start gap-3 border border-border rounded-md px-3 py-2.5 bg-panel-2"
              >
                <div className="mt-0.5 shrink-0">{eventIcon(ev.eventType, ev.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm text-text-main font-medium">{label}</span>
                    <span className={"text-xs " + (ev.status === "success" ? "text-green" : "text-red")}>
                      {ev.status === "success" ? "הצלחה" : "כשל"}
                    </span>
                    {rel && <span className="text-xs text-text-dim">{rel}</span>}
                  </div>
                  {meta && (
                    <p className="text-xs text-text-dim mt-1 break-all">{meta}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-text-dim font-mono">
                    <span dir="ltr">{formatDateTime(ev.createdAt)}</span>
                    {ev.ipAddress && <span dir="ltr">IP: {ev.ipAddress}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
