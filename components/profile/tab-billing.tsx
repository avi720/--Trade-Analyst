"use client";

import { useState } from "react";
import { Check, Sparkles, Loader2 } from "lucide-react";
import type { SubscriptionTier } from "@/lib/billing/tier";
import {
  PRICE_MONTHLY_USD,
  PRICE_ANNUAL_USD,
  PROMO_MONTHLY_USD,
  PROMO_MONTHLY_DURATION_MONTHS,
  PROMO_ANNUAL_USD,
} from "@/lib/billing/prices";

interface TabBillingProps {
  userTier: SubscriptionTier;
  subscriptionStatus: string | null;
  subscriptionRenewsAt: string | null;
  isLaunchPromo: boolean; // Server-computed (X16 — no client-clock drift).
}

const PRICES = {
  monthly: { usd: PRICE_MONTHLY_USD, label: "חודשי" },
  annual: { usd: PRICE_ANNUAL_USD, label: "שנתי" },
} as const;

const LAUNCH_PRICES = {
  monthly: { usd: PROMO_MONTHLY_USD, months: PROMO_MONTHLY_DURATION_MONTHS },
  annual: { usd: PROMO_ANNUAL_USD },
} as const;

type Plan = keyof typeof PRICES;

const FREE_FEATURES = [
  "הזנה ידנית — עד 30 טריידים",
  "לוח research מלא",
  "חיפוש וסינון עסקאות",
  "3 הודעות לחנן (AI) ביום, מצב בסיסי",
];

const PRO_FEATURES = [
  "כל מה שיש ב-Free",
  "הזנה ידנית — ללא הגבלה",
  "ייבוא Excel של עסקאות",
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

export function TabBilling({ userTier, subscriptionStatus, subscriptionRenewsAt, isLaunchPromo }: TabBillingProps) {
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
              <SubscriptionStateControls
                subscriptionStatus={subscriptionStatus}
              />
              <p className="text-xs text-text-dim mt-4">
                לעדכון פרטי תשלום או ביטול — חפש את מייל האישור מ-Lemon Squeezy
                בתיבה שלך וגש משם למרכז הניהול.
              </p>
            </div>
          </div>
        </div>
      ) : subscriptionStatus === "paused" ? (
        <div className="panel p-6">
          <div className="flex items-start gap-3">
            <Sparkles size={20} className="text-text-dim shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-base font-semibold text-text-main">
                המנוי שלך: מושהה
              </p>
              <p className="text-sm text-text-dim mt-2">
                אתה במסלול Free בזמן ההשהיה. כשתפעיל מחדש, החיוב יחודש ותקבל בחזרה
                את כל יכולות Pro.
              </p>
              <SubscriptionStateControls
                subscriptionStatus={subscriptionStatus}
              />
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

          {isLaunchPromo && (
            <div className="rounded-md border border-green/30 bg-green/5 p-3 text-center">
              <p className="text-sm font-semibold text-green">🚀 מבצע השקה — מחירים מוזלים לנרשמים עכשיו!</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PlanCard
              plan="monthly"
              priceUsd={isLaunchPromo ? LAUNCH_PRICES.monthly.usd : PRICES.monthly.usd}
              originalPriceUsd={isLaunchPromo ? PRICES.monthly.usd : undefined}
              title="חודשי"
              subtitle={isLaunchPromo ? `$${LAUNCH_PRICES.monthly.usd} ל-${LAUNCH_PRICES.monthly.months} חודשים, אח״כ $${PRICES.monthly.usd}` : "חיוב חודשי, ביטול בכל עת"}
              loading={loadingPlan === "monthly"}
              onSelect={() => startCheckout("monthly")}
            />
            <PlanCard
              plan="annual"
              priceUsd={isLaunchPromo ? LAUNCH_PRICES.annual.usd : PRICES.annual.usd}
              originalPriceUsd={isLaunchPromo ? PRICES.annual.usd : undefined}
              title="שנתי"
              subtitle={isLaunchPromo ? "מחיר השקה בלעדי!" : "חיסכון של ~17% לעומת חודשי"}
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
  originalPriceUsd,
  title,
  subtitle,
  loading,
  onSelect,
  recommended,
}: {
  plan: Plan;
  priceUsd: number;
  originalPriceUsd?: number;
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
        {originalPriceUsd && (
          <span className="text-lg text-text-dim font-mono line-through">
            ${originalPriceUsd.toFixed(2)}
          </span>
        )}
        <span className={"text-3xl font-bold font-mono " + (originalPriceUsd ? "text-green" : "text-text-main")}>
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

/**
 * X22 — pause / resume subscription buttons.
 *
 * Shown as "השהה מנוי" while status is 'active' or 'on_trial', and as
 * "הפעל מנוי מחדש" while status is 'paused'. Any other status hides the
 * control (e.g., cancelled / expired). After success we do a hard reload so
 * the server-rendered `subscriptionStatus` prop refreshes.
 */
function SubscriptionStateControls({
  subscriptionStatus,
}: {
  subscriptionStatus: string | null;
}) {
  const [loading, setLoading] = useState<null | "pause" | "resume">(null);
  const [error, setError] = useState<string | null>(null);

  const canPause = subscriptionStatus === "active" || subscriptionStatus === "on_trial";
  const canResume = subscriptionStatus === "paused";

  if (!canPause && !canResume) return null;

  async function submit(action: "pause" | "resume") {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/billing/${action}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "שגיאה. נסה שוב.");
        setLoading(null);
        return;
      }
      // The webhook processes the state change asynchronously, but LS is
      // usually within a second or two. Hard-reload so the server component
      // re-fetches the fresh subscriptionStatus.
      window.location.reload();
    } catch {
      setError("שגיאת רשת. נסה שוב.");
      setLoading(null);
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-2">
      {canPause && (
        <button
          type="button"
          onClick={() => submit("pause")}
          disabled={loading !== null}
          className="w-full sm:w-auto inline-flex items-center justify-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-text-main hover:border-amber hover:text-amber disabled:opacity-50 transition-colors"
        >
          {loading === "pause" ? (
            <Loader2 size={14} className="animate-spin" aria-label="טוען" />
          ) : (
            "השהה מנוי"
          )}
        </button>
      )}
      {canResume && (
        <button
          type="button"
          onClick={() => submit("resume")}
          disabled={loading !== null}
          className="w-full sm:w-auto inline-flex items-center justify-center rounded-md bg-amber px-4 py-2 text-sm font-medium text-bg-dark hover:bg-amber/90 disabled:opacity-50 transition-colors"
        >
          {loading === "resume" ? (
            <Loader2 size={14} className="animate-spin" aria-label="טוען" />
          ) : (
            "הפעל מנוי מחדש"
          )}
        </button>
      )}
      {error && (
        <p className="text-xs text-red mt-1" role="alert">
          {error}
        </p>
      )}
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
