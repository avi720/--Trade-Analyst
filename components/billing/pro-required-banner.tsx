"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

interface ProRequiredBannerProps {
  feature: string;
  className?: string;
}

export function ProRequiredBanner({ feature, className }: ProRequiredBannerProps) {
  return (
    <div
      className={
        "rounded-md border border-amber/30 bg-amber-tint p-4 mb-6 " + (className ?? "")
      }
      role="status"
    >
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="text-amber shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium text-text-main">
            {feature} זמין במסלול Pro בלבד
          </p>
          <p className="text-xs text-text-dim mt-1">
            שדרג ל-Pro ל-$19.99/חודש לקבלת גישה מלאה (14 ימי ניסיון חינם).
          </p>
          <Link
            href="/profile?tab=billing"
            className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-amber hover:underline"
          >
            צפה במסלולים ←
          </Link>
        </div>
      </div>
    </div>
  );
}
