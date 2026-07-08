/**
 * Single source of truth for subscription pricing.
 *
 * Prior to X16/X18 (SECURITY-AUDIT-LAUNCH.md), the four prices — and the
 * launch-promo end date — were hardcoded in four separate files:
 *   - components/profile/tab-billing.tsx
 *   - components/billing/pro-required-banner.tsx
 *   - app/page.tsx (landing page pricing cards)
 *   - lib/billing/lemon-squeezy.ts (LAUNCH_PROMO_END)
 * Any price adjustment risked leaving one file behind — the existing bug of
 * $19.99 → $14.99 landing on the banner and landing page in different commits
 * was exactly this class of drift.
 *
 * This module is now the ONLY place any of these values live. All callers
 * import from here; changing a price is a one-file edit.
 */

export const PRICE_MONTHLY_USD = 14.99
export const PRICE_ANNUAL_USD = 149.99

// Launch promo — active until LAUNCH_PROMO_END. Discount codes for these
// live in LEMONSQUEEZY_DISCOUNT_CODE_LAUNCH_* env vars; the numbers here
// are display-only (used in copy). Server-side authoritative price is what
// Lemon Squeezy applies after redeeming the discount code.
export const PROMO_MONTHLY_USD = 9.99
export const PROMO_MONTHLY_DURATION_MONTHS = 3
export const PROMO_ANNUAL_USD = 99.99

export const LAUNCH_PROMO_END = new Date('2026-08-01T00:00:00Z')

export function isLaunchPromoActive(): boolean {
  return Date.now() < LAUNCH_PROMO_END.getTime()
}
