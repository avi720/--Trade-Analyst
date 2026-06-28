"use client";

import { useState } from "react";
import { Check, Sparkles, Loader2 } from "lucide-react";
import type { SubscriptionTier } from "@/lib/billing/tier";

interface TabBillingProps {
  userTier: SubscriptionTier;
  subscriptionStatus: string | null;
  subscriptionRenewsAt: string | null;
}

const PRICES = {
  monthly: { usd: 19.99, label: "חודשי" },
  annual: { usd: 179.99, label: "שנתי" },
} as const;

type Plan = keyof typeof PRICES;

const FREE_FEATURES = [
  "ייבוא ידני של עסקאות",
  "לוח research מלא",
  "חיפוש וסינון עסקאות",
  "3 הודעות לחנן (AI) ביום, מצב בסיסי",
];

const PRO_FEATURES = [
  "כל מה שיש ב-Free",
  "סנכרון אוטומטי מ-Interactive Brokers",
  "חנן ללא הגבלה + מצב Pro מעמיק (גישה לכל ההיסטוריה)",
  "ייצוא CSV של פעילות",
  "14 ימי ניסיון חינם",
];

function formatStatus(status: string | null): string {
  if (!status) return "ללא מנוי";
  const map: Record<string, string> = {
    on_trial: "בתקופת ניסיון",
    active: "פעיל",
    past_due: "תשלום מעוכב",
    paused: "מושהה",
    cancelled: "מבוטל (פעיל עד סוף התקופה)",
    expired: "פג תוקף",
    unpaid: "לא שולם",
  };
  return map[status] ?? status;
}

function formatRenewsAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function TabBilling({ userTier, subscriptionStatus, subscriptionRenewsAt }: TabBillingProps) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(plan: Plan) {
    setLoadingPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "שגיאה ביצירת התשלום");
        setLoadingPlan(null);
        return;
      }
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      setError("לא התקבל קישור לתשלום");
      setLoadingPlan(null);
    } catch {
      setError("שגיאת רשת. נסה שוב.");
      setLoadingPlan(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-main">מנוי</h2>
        <p className="text-sm text-text-dim mt-1">ניהול תוכנית המנוי שלך</p>
      </div>

      {userTier === "Pro" ? (
        <div className="panel p-6">
          <div className="flex items-start gap-3">
            <Sparkles size={20} className="text-amber shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-base font-semibold text-text-main">
                המנוי שלך: Pro
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
                <dt className="text-text-dim">סטטוס</dt>
                <dd className="text-text-main">{formatStatus(subscriptionStatus)}</dd>
                <dt className="text-text-dim">חידוש הבא</dt>
                <dd className="text-text-main font-mono">
                  {formatRenewsAt(subscriptionRenewsAt)}
                </dd>
              </dl>
              <p className="text-xs text-text-dim mt-4">
                לעדכון פרטי תשלום או ביטול — חפש את מייל האישור מ-Lemon Squeezy
                בתיבה שלך וגש משם למרכז הניהול.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-amber/30 bg-amber-tint p-4">
            <p className="text-sm text-text-main">
              אתה במסלול <strong>Free</strong>. שדרג ל-Pro לקבלת סנכרון IBKR,
              חנן ללא הגבלה, וייצוא CSV.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-red/30 bg-red/10 p-3 text-sm text-red">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PlanCard
              plan="monthly"
              priceUsd={PRICES.monthly.usd}
              title="חודשי"
              subtitle="חיוב חודשי, ביטול בכל עת"
              loading={loadingPlan === "monthly"}
              onSelect={() => startCheckout("monthly")}
            />
            <PlanCard
              plan="annual"
              priceUsd={PRICES.annual.usd}
              title="שנתי"
              subtitle="חיסכון של ~25% לעומת חודשי"
              loading={loadingPlan === "annual"}
              onSelect={() => startCheckout("annual")}
              recommended
            />
          </div>

          <p className="text-xs text-text-dim text-center">
            14 ימי ניסיון חינם · ביטול בכל עת · התשלום מעובד על ידי Lemon Squeezy
          </p>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FeatureList title="Free" features={FREE_FEATURES} />
        <FeatureList title="Pro" features={PRO_FEATURES} highlighted />
      </div>
    </div>
  );
}

function PlanCard({
  priceUsd,
  title,
  subtitle,
  loading,
  onSelect,
  recommended,
}: {
  plan: Plan;
  priceUsd: number;
  title: string;
  subtitle: string;
  loading: boolean;
  onSelect: () => void;
  recommended?: boolean;
}) {
  const monthlyEquivalent = title === "שנתי" ? priceUsd / 12 : null;

  return (
    <div
      className={
        "panel p-5 relative " +
        (recommended ? "border-amber/50 ring-1 ring-amber/20" : "")
      }
    >
      {recommended && (
        <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wider text-amber bg-amber-tint px-2 py-0.5 rounded">
          מומלץ
        </span>
      )}
      <h3 className="text-base font-semibold text-text-main">{title}</h3>
      <p className="text-sm text-text-dim mt-1">{subtitle}</p>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-text-main font-mono">
          ${priceUsd.toFixed(2)}
        </span>
        <span className="text-sm text-text-dim">
          {title === "שנתי" ? "/שנה" : "/חודש"}
        </span>
      </div>
      {monthlyEquivalent && (
        <p className="text-xs text-text-dim mt-1">
          שווה ערך לכ-${monthlyEquivalent.toFixed(2)}/חודש
        </p>
      )}
      <button
        type="button"
        onClick={onSelect}
        disabled={loading}
        className="mt-5 w-full inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium bg-amber text-bg-dark hover:bg-amber/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" aria-label="טוען" />
        ) : (
          "התחל ניסיון חינם"
        )}
      </button>
    </div>
  );
}

function FeatureList({
  title,
  features,
  highlighted,
}: {
  title: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div className={"panel p-5 " + (highlighted ? "border-amber/30" : "")}>
      <h4 className="text-sm font-semibold text-text-main mb-3">{title}</h4>
      <ul className="space-y-2">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Check
              size={14}
              className={"shrink-0 mt-1 " + (highlighted ? "text-amber" : "text-text-dim")}
              aria-hidden="true"
            />
            <span className={highlighted ? "text-text-main" : "text-text-dim"}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
