# Trade Analysis — UX Ease-of-Use Audit & Remediation Plan

> **Audit date:** 2026-06-19
> **Auditor:** Claude (ui-ux-pro-max skill)
> **App version reviewed:** main branch at commit `c6e2b35` + production at https://trade-analyst-lyart.vercel.app/research
> **Status:** ✅ COMPLETED 2026-06-24 — all 13 findings closed (F1–F13). No open questions. No new findings discovered during remediation. Re-open by changing Status to ACTIVE and adding new findings under "Discovered During Remediation".

---

## Background

Trade Analysis is a Hebrew RTL trading journal with an AI chat assistant ("חנן"), built on Next.js 16 App Router + React 19 + Supabase. End users are individual retail traders; the product is intentionally desktop / tablet only (no mobile breakpoint is supported) — research, search and manual import are the three primary surfaces. The audit focused on `/research`, the analytics dashboard that aggregates trade history into 8 KPI cards and 7 charts gated by a wide filter bar.

**Scope:** Ease-of-use of the `/research` screen — discoverability of filters and resets, affordance of KPI cards, navigation chrome (header / user menu), feedback on filter change, and information hierarchy on the desktop viewport. Some findings affect global components (`Header`) so they are not strictly research-only. F11 covers a single decided wording change on `/manual-import`; the broader `/manual-import` simplification is deferred. Out of scope: mobile / tablet behaviour (the product does not target those breakpoints); a chip-style summary of active filters above the KPI row was considered and rejected by the owner — the per-input visible value plus the F7 loading transition cover the need. Performance, accessibility beyond ease-of-use friction, and visual identity belong to [`docs/UI-AUDIT.md`](UI-AUDIT.md) and [`docs/PERFORMANCE-AUDIT.md`](PERFORMANCE-AUDIT.md).

**Stack reviewed:** Next.js 16 · React 19 · Tailwind CSS · Supabase JS · Recharts (assumed) · IBM Plex Mono + Assistant fonts · custom design tokens (`--bg-dark`, `--panel-bg`, `--green`, `--red`, `--amber`).

**Methodology:**
1. Live walk-through in Edge against the deployed production URL (`/research`, `/search`, `/manual-import`) with the QA test user already authenticated; pages opened via the Claude-in-Chrome MCP. DOM, computed styles, viewport size, and click behaviour were probed with `read_page`, `get_page_text` and JS in the live page.
2. Source read of the components touched by each finding: `components/header.tsx`, `components/research-dashboard.tsx`, `components/research/filter-bar.tsx`, `components/research/shell.tsx`, `components/research/charts.tsx`, `components/info-tooltip.tsx`, `app/(dashboard)/research/page.tsx`.
3. Findings shared with the owner mid-audit; corrections (e.g., "the chart-picker checkboxes ARE labelled", "`P&L` color encoding is fine", "the clear-filters button already exists, it just needs to move") applied before this document was written.
4. Items scored internally with `Priority = (Impact + Risk) × (6 − Effort)` to order findings within each phase. Scores are not printed.

**Reference frameworks:** WCAG 2.1 AA · Material Design 3 (state & elevation) · Apple HIG (touch target sizing, scan-path hierarchy) · Nielsen heuristic #1 (visibility of system status) and #6 (recognition over recall).

---

## How to Use This Plan

- Each finding is **outcome-driven**: it states what is wrong and what "fixed" looks like, but **not** how to implement it. The implementer chooses the approach.
- Work top-down by phase. **Do not skip Phase 1.** Phase 1 contains issues that block the next release.
- Tick the box only when the **Acceptance** clause is satisfied — not when the change is merely written.
- When an item lands, flip `[ ]` → `[x]` on the heading line. Empty boxes mean unfinished; ticked boxes mean Acceptance met. This lets anyone (or any session) skim the file and trust the state without re-deriving what shipped.
- If a finding turns out to be invalid in context, leave the box unchecked and add a `~~strikethrough~~` note explaining why.
- New findings discovered during fixes go at the bottom under "Discovered During Remediation".
- A finding may overlap with [`docs/UI-AUDIT.md`](UI-AUDIT.md) or [`docs/TECH-DEBT.md`](TECH-DEBT.md). When it does, the cross-reference appears in the Issue line. Fix once; tick the box in both files.

---

## Strengths — What Already Works Well

Preserve these patterns when refactoring:

- **Tabular numerics for all money / R values.** `components/research-dashboard.tsx:307` formats Profit Factor and other KPI values through font-mono (IBM Plex Mono). Numbers don't shift width as data changes — keep this consistent with any new metric or drill-down.
- **LTR wrapping of numeric strings inside RTL.** Values like `+1.05R` and `+$4,222.00` arrive in the DOM wrapped in `⁦…⁩` (LRE/PDI). This is the right way to keep signs and currency symbols where Hebrew readers expect them and must be reused in any new card.
- **44×44 px info-button hit targets** on every KPI card (verified live, `btnW=44, btnH=44`). Touch target rule from Apple HIG is already met; do not shrink these when restyling.
- **`Skip to main content` link** is present at the top of every page (`דלג לתוכן הראשי`). Keep when restructuring the header.
- **Live region for filter results.** `components/research-dashboard.tsx:282` already exposes a polite, atomic `aria-live` region for "מציג N טריידים" — change the same region instead of inventing a new announcement when adding visible filter feedback.
- **Per-user persistence of chart selection / sizes** is already wired (the owner confirmed `localStorage` saves the chart picker). Mirror this pattern for any new "collapse the filter / collapse the KPIs" preference instead of inventing a new mechanism.
- **Filter-bar input variant `dir="ltr"` for numeric fields** (`components/research/filter-bar.tsx:164`) — keeps minus signs and decimals readable inside an RTL page. Reuse for any new number input.
- **`InfoTooltip` self-corrects alignment after measuring** (`components/info-tooltip.tsx:23`) — prevents the "open in wrong position, then jump" flicker on edge cards. Reuse the same hook for any new popover, don't reimplement.

---

## Findings

ID convention: `F##` numbered globally across phases. Where a finding was confirmed by reading the deployed response or running the code path, the `Issue` line says **"Confirmed."**

---

### Phase 1 — Critical (Day-1 blockers, must clear before next release)

#### [x] F1. User-menu dropdown does not open for the user
- **Where:** `components/header.tsx:78-122` — the `dropdownOpen` state + the conditional `{dropdownOpen && (…)}` block.
- **Issue:** **Confirmed.** The owner reports that clicking the avatar "Y" button in the header does nothing visible — the dropdown never appears, blocking access to **פרופיל והגדרות** and **התנתק**. A live probe found a more subtle picture: after `userBtn.click()` the button's `aria-expanded` flips to `"true"` and the document HTML grows by ~510 chars, which means React state and the conditional render are firing — but the user cannot see the menu. Most likely the rendered `<div className="absolute left-0 mt-1 w-48 …">` is positioned, stacked, or RTL-aligned in a way that hides it from view (off-screen on the physical left edge, behind the fixed-width chat sidebar at higher `z-index`, or clipped by a `overflow-hidden` ancestor — the header itself has `overflow-x-auto` on line 36 which clips abs-positioned descendants when the menu extends below the header bar). This is a release blocker because logout currently has no other exit path on the screen.
- **Acceptance:** Clicking the avatar opens a visible menu with **email**, **פרופיל והגדרות**, and **התנתק** rows; clicking outside or pressing `Esc` closes it; `Tab` moves focus through the rows in DOM order; `התנתק` actually signs the user out (round-trip verified by landing on `/login`). Verified by manual test in Edge at production URL with the same QA test user, and by automated check that `[aria-label^="תפריט משתמש"]` followed by `click()` exposes at least one focusable descendant link or button in the next paint.

---

### Phase 2 — Important (correctness & integrity)

#### [x] F2. "נקה פילטרים" is hidden at the end of the filter row and easy to miss
- **Where:** `components/research/filter-bar.tsx:172-180` — the button sits after a `<div className="flex-1" />` spacer at the far visual edge of a wide row, and only renders when `hasActiveFilter` is true.
- **Issue:** **Confirmed.** The reset action exists but lives at the trailing end of a 1500-px-wide filter row, behind a stretch spacer, and only when the user has already filtered. In Hebrew RTL that places it at the physical *left* edge of the bar, far from the "סינון" H2 that anchors the user's attention. Users won't find it. The functionality is correct; the placement defeats discoverability (Nielsen #1 "visibility of system status" + #6 "recognition over recall").
- **Acceptance:** "נקה פילטרים" appears inline with the "סינון" panel header (same row, opposite side, sticky to the top of the panel when the panel scrolls). It is visible the moment any single filter differs from its default — same `hasActiveFilter` trigger, just re-located — and disappears when all filters are back to default. Verified by setting any one filter (e.g., direction = Long), seeing the button appear next to "סינון" without horizontal scanning, clicking it, and confirming all filters reset and the button hides.

#### [x] F3. Numeric range filters do not communicate what to type
- **Where:** `components/research/filter-bar.tsx` — six inputs for `איכות ביצוע` min/max, `זמן החזקה` min/max, and `R` min/max (line 162-168 for the R pair).
- **Issue:** **Confirmed.** All six inputs use `placeholder="מינ׳"` / `"מקס׳"` / `"—"` with no example, no helper text and no indication of inclusivity. A user who wants "winners with R ≥ 1" cannot tell whether to type `1` (inclusive?) or `0.99` (exclusive?), and the placeholder gives no scale clue (is `איכות` on a 1-10 scale or 0-100?). The owner-facing scale ("איכות 1-10") is in the surrounding label, but only on first read; the placeholders carry zero memory of it.
- **Acceptance:** Each numeric range pair shows (a) a concrete example value as placeholder appropriate to the field (e.g., `1.0` / `5.0` for R, `1` / `10` for איכות, `1` / `24` for זמן החזקה in hours) and (b) a small "כולל ערך זה" hint visible under or beside the pair, on the same row as the inputs. Verified by tabbing into each empty input and seeing both the example placeholder and the inclusivity hint without opening tooltips.

#### [x] F4. Ticker field has no autosuggest from existing data
- **Where:** `components/research/filter-bar.tsx` — the ticker `<input>` with `placeholder="AAPL..."`.
- **Issue:** Confirmed by interaction: typing `AAP` does not surface `AAPL`. The user must remember the exact ticker spelling or copy it from `/search`. Every ticker the user could possibly filter on is already in the trade dataset the dashboard just loaded, so suggestions are free.
- **Acceptance:** Typing into the ticker field shows a dropdown of tickers that exist in the user's `Order` rows and match the typed prefix (case-insensitive). Up/Down arrows move the highlight; Enter selects; Escape closes. Verified by typing `a` and confirming the suggestion list contains AAPL, AMD, AMZN (or whichever the user actually traded), in whatever order is convenient — alphabetical or by recent trade count, implementer's choice.

#### [x] F5. KPI info button has no hint that it requires a click
- **Where:** `components/info-tooltip.tsx:17` — the `<InfoTooltip>` toggle.
- **Issue:** Confirmed by interaction: hovering an info ⓘ button on a KPI card changes its colour to amber (good — hover state exists), but the popover only opens on click, with no surfaced text telling users that. Web convention is that ⓘ icons open on hover; deviating from that convention without a hint costs first-time users a beat of confusion every visit. The owner confirms the click-only behaviour is intentional (avoids accidental open from chart interactions) — so this is about affordance, not the interaction itself.
- **Acceptance:** Hovering an info button shows a small native tooltip (or inline label inside the button's amber state) reading "לחץ למידע". The popover itself still opens on click. Verified by hovering any KPI card's ⓘ in Edge and seeing the hint appear within the standard browser tooltip delay (≈500 ms), and confirming the click behaviour is unchanged.

#### [x] F6. KPI cards are not drill-downable
- **Where:** `components/research-dashboard.tsx:291-309` — the 8 `<MetricCard>` instances.
- **Issue:** The cards summarise the trade set but do not let the user pivot into the rows behind a number. A user looking at "אחוז הצלחה 66.7%" usually wants to inspect the winners — currently they must rebuild the same filter manually in `/search`. The card is the natural drill-down trigger; today it is dead text. This is the highest-impact ease-of-use lift on the page after F1.
- **Acceptance:** Clicking a metric card navigates to `/search` carrying the **current `/research` filter set** plus a card-appropriate extra filter according to this mapping (no sorting — only filtering, owner decision):

  | Card | Extra filter on `/search` |
  |---|---|
  | טריידים (count) | none — current filters only |
  | אחוז הצלחה | `result=Win` |
  | R ממוצע | none — current filters only |
  | Profit Factor | none — current filters only |
  | Expectancy | none — current filters only |
  | Max Drawdown | `result=Loss` |
  | סה״כ P&L | none — current filters only |
  | ממוצע רווח / הפסד | none — current filters only |

  Cards advertise their clickability with a persistent right-aligned chevron `›` (low-contrast, font-mono, matches the existing amber colour on hover) and a native `title` / hover-tooltip reading "פתח בדף החיפוש". Keyboard focus shows an amber outline; `Enter` activates the drill-down. Verified by tabbing onto each card, seeing the chevron at rest, hovering and seeing the "פתח בדף החיפוש" tooltip within ~500 ms, pressing Enter, and landing on `/search` with the matching rows pre-filtered.

#### [x] F7. Filter changes give no transient feedback while values recompute
- **Where:** `components/research-dashboard.tsx` — the KPI cards grid (lines 291-318 range) and the charts grid below it.
- **Issue:** Changing a filter (e.g., picking a setup from the `סטאפ` dropdown) replaces the numbers and re-paints the charts with no visible transition. Even when the recomputation is fast (client-side, no network), the absence of a short loading affordance makes the user uncertain whether the filter actually applied — they fall back to scanning the field they just touched to confirm the value stuck. The owner has confirmed that the per-field "current value visible in the input" already covers the *what was filtered* question; the gap is the *did the data update* question. Overlaps in spirit with the live-region status string already in place at `research-dashboard.tsx:282`, but the live region is screen-reader only and does not visually confirm the change.
- **Acceptance:** When any filter value changes, the KPI cards and charts grid both show a brief loading affordance — shimmer, skeleton, or opacity dip with a small spinner — for a minimum of ~250-400 ms even if the computation is instant. The affordance is consistent between the two regions (same visual language). After the affordance clears, the new numbers are in place. Verified by changing a single filter and seeing the transition fire on every change, not only when the result set actually differs from the previous one.

---

### Phase 3 — Polish (consistency / hygiene)

#### [x] F8. Filter panel cannot be collapsed
- **Where:** `components/research-dashboard.tsx:248-276` — the `<FilterBar>` render.
- **Issue:** The filter bar takes a vertical band that the user does not need once they have committed to a view. A trader spending an hour looking at the equity curve has the filter panel parked at the top of the page eating ~120 px every time they scroll back up. There is currently no way to give that space to the charts.
- **Acceptance:** An independent collapse / expand toggle sits in the filter panel header (next to or replacing the "סינון" wordmark). Clicking it collapses the filter rows to a single-line summary ("הסתר סינון") and exposes them again when clicked. The toggle is **independent of F9** (two separate toggles, owner decision: prefers flexibility over a single "focus mode"). The choice persists across reloads via the same `localStorage` mechanism used for chart selection; default state is `expanded`. Verified by collapsing, reloading the page, and seeing the panel still collapsed; expanding it again restores the full filter UI without re-mounting filter state.

#### [x] F9. KPI cards row cannot be collapsed
- **Where:** `components/research-dashboard.tsx:291` — the `<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">` container.
- **Issue:** Same shape as F8: the 8-card grid takes a fixed second band that some sessions are entirely about the charts. There is no way to suppress it.
- **Acceptance:** An independent collapse / expand toggle sits at the start of the KPI row (right-aligned in RTL). Collapsed, it reduces to a single-line summary ("הסתר מדדים", with the headline number — `סה״כ P&L` — still visible). Expanded, it shows all 8 cards. The toggle is **independent of F8**. The choice persists in `localStorage` (same key namespace as the chart selection). Default = expanded. When both F8 and F9 are collapsed the charts grid grows to fill the freed vertical space without further user action. Verified by collapsing both, reloading, and seeing the chart area occupy what would otherwise be three stacked sections.

#### [x] F10. Typography scale on `/research` does not establish a scan path
- **Where:** `app/(dashboard)/research/page.tsx:17` (visual `<h1>` is `sr-only`); `components/research-dashboard.tsx` (KPI value font-size); `components/research/charts.tsx` and `components/research/filter-bar.tsx` (widget H2 sizing).
- **Issue:** **Confirmed.** Computed font sizes on the live page:
  - Visible page title: none (the H1 "תחקור" is `sr-only`)
  - "סינון" H2: 14 px / 600
  - Widget H2 ("עקומת הון", "התפלגות R"): 14 px / 400
  - KPI label ("אחוז הצלחה"): 14 px / 400
  - KPI value ("66.7%"): 14 px (verified via `getComputedStyle`)
  - Labels and form text: 14 px

  Almost every text level on the page is 14 px. The eye has no anchor for "what page am I on", "what section am I in", "what's the headline number". Overlaps with [`docs/UI-AUDIT.md`](UI-AUDIT.md) Phase 2 design-system work — fix once; tick in both.
- **Acceptance:** Computed font sizes after the change satisfy:
  - Visible page title for `/research`: ≥ 24 px font-mono — present in the DOM, not `sr-only`
  - KPI value: ≥ 24 px IBM Plex Mono — visually the largest text on the card
  - Widget H2 ("עקומת הון" etc.): 16 px / 600
  - KPI label: ≤ 13 px and uppercase or tracking-wide so it reads as a caption against the value
  - Filter labels: unchanged (14 px is correct for a form)

  Verified by spot-checking each level in DevTools and by a 1-second squint test: page title, section, widget, label, value must each be distinguishable from one viewer-distance glance. Tested in dark mode (the only mode the product ships).

#### [x] F11. `/manual-import` helper uses unexplained jargon "leg"
- **Where:** `components/manual-import-form.tsx` (or whichever component renders the "הזנת ביצועים ידנית" header on `/manual-import`) — the sub-line currently reads `כל כרטיס = ביצוע אחד (leg)`.
- **Issue:** "leg" is broker terminology that does not earn its place in a Hebrew user-facing string. The owner has already decided the wording change; this finding exists so the change is not lost while the broader manual-import simplification stays deferred.
- **Acceptance:** The helper line reads exactly `כל כרטיס = ביצוע פעולה אחת (קנייה/מכירה)`. Verified by reading the page on `/manual-import` and grepping the codebase for any remaining `leg` in user-visible Hebrew strings (case-insensitive). Other "leg" references in code / types / English comments are out of scope for this finding.

---

## Open Questions / Items Requiring Owner Input

> Phase 1-3 closed. The `/manual-import` simplification that was deferred here has been promoted into scoped findings F12 and F13 below; no items currently waiting on owner input.

---

## Discovered During Remediation

> Added after Phase 1-3 landed, promoted from the Phase-1-3 deferred "broader `/manual-import` simplification" open question. Same format: `[ ] F##. Title` + Where / Issue / Acceptance.

#### [x] F12. `/manual-import` open-trade tab gives no concrete starting example
- **Where:** `components/trade-entry-form.tsx` — the `TradeEntryForm` component, which mounts with a single blank `LegCard` (`EMPTY_LEG()` at line 12-23).
- **Issue:** A first-time user landing on `/manual-import → טרייד פתוח` sees a blank card with eight required fields, the side dropdown defaulted to BUY, the date at today, and no concrete shape of what a valid entry looks like. The form *is* simpler than it looks, but the user has no way to learn that without filling it out and submitting. Adjacent forms (closed-trade, Excel-import) suffer the same gap but the open-trade tab is the default landing tab and the highest-leverage place to fix it.
- **Acceptance:** A "טען דוגמה" button is visible in the form header (next to "אזור זמן" or paired with "+ הוסף ביצוע"). Clicking it replaces the current legs with one example leg populated with: ticker `AAPL`, side `Long` (BUY), date = today, time `14:30`, quantity `100`, price `150`, commission `1`, currency `USD`, commissionCurrency `USD`, broker `IBKR`. The button leaves collapsible sections (פרטי הזמנה / הערות אישיות) collapsed. The form remains fully submittable from the example state with no edits — submitting the example produces a real trade in the database. Verified on localhost by opening `/manual-import`, clicking "טען דוגמה", confirming all eight required fields are populated, and submitting successfully.

#### [x] F13. Manual-entry forms carry broker / English jargon without explanation
- **Where:** `components/trade-entry-form.tsx`, `components/closed-trade-entry-form.tsx`, `components/trade-excel-import.tsx`, `components/manual-import-tabs.tsx` — all user-visible labels, helper text, placeholders, and tooltips.
- **Issue:** The open question deferred from Phase 1-3 ("pass through all `ManualLeg` field labels and tooltips for broker jargon") is now scoped here. Candidates the owner has already flagged include "פרטי הזמנה" (may want to be "פרטי פקודה בברוקר"), the English Long/Short in the side dropdown inside an otherwise Hebrew UI, sub-tab labels, the "= 06:30 UTC" inline preview helper, and any other broker terminology a non-IBKR-fluent user would not recognise. This finding has a **two-step acceptance**: a recommendation pass first, then a separately-authorised change pass — implementer does NOT edit code until the owner approves the proposed wording.
- **Acceptance — step 1 (recommendation):** A written list lands in this doc (under this finding) of every wording change proposed across the three forms + the tablist, each with the file:line, the current wording, the recommended wording, and a one-line reason. The list does not assume any change is approved.
- **Acceptance — step 2 (change pass):** After owner approval of the recommendation list, the wording changes are applied to the codebase exactly as approved. Verified on localhost by opening each tab and confirming the new wording is in place; build + tests pass.

**Recommendation list (presented 2026-06-24) — owner decisions in `[approval]` brackets:**
1. `manual-import-tabs.tsx:12-13` — keep "טרייד פתוח" / "טרייד סגור" (loanword acceptable in audience). `[approved — no change]`
2. `trade-entry-form.tsx:100,132` + `closed-trade-entry-form.tsx:132` — label "צד" → **"כיוון"** (matches /research filter wording, clearer to novice). `[approved — applied]`
3. Long/Short option labels — propose "Long (קנייה) / Short (מכירה)". `[rejected by owner — kept as-is]`
4. `trade-entry-form.tsx:227` + `closed-trade-entry-form.tsx:191` — collapsible header "פרטי הזמנה" → **"פרטי הפקודה אצל הברוקר"** (jargon disambiguation). `[approved — applied]`
5. `trade-entry-form.tsx` stop-price label + `closed-trade-entry-form.tsx` open-stop-price label — "מחיר עצירה" → **"מחיר סטופ"** (consistency with `close-fields-input.tsx` which already uses "סטופ"). `[approved — applied]`
6. `trade-entry-form.tsx` bottom helper — replace "הביצועים עוברים דרך אותו pipeline FIFO כמו IBKR — כפולים (לפי brokerExecId) יידחו אוטומטית" with **"ביצועים זהים (לפי מזהה ייחודי) יזוהו וידחו אוטומטית"** (strip pipeline / FIFO / IBKR / brokerExecId jargon). `[approved — applied]`
7. UTC preview helper spans (3 files, 5 occurrences) — add `title="שעון אוניברסלי – הזמן שבו האירוע נשמר בבסיס הנתונים"` (tooltip explains UTC without enlarging the inline text). `[approved — applied]`
8. `trade-excel-import.tsx:178` — preview table header "צד" → **"כיוון"** (consistency with #2). `[approved — applied]`
9. `trade-excel-import.tsx:184` — preview table header "עצירה" → **"סטופ"** (consistency with #5). `[approved — applied]`

Items left for explicit future scope (not surveyed as candidates here): trade-detail-modal "צד" header in /search results (out of scope per F13 which targets manual-entry forms only); SETUP_GROUPS / EMOTIONAL_STATES / CLOSE_REASONS constants in `lib/constants/trade-options.ts` (already standard Hebrew trading vocabulary). Verified on localhost 2026-06-24: open-trade tab shows the new "כיוון" label + "פרטי הפקודה אצל הברוקר" collapsible + "מחיר סטופ" inside + UTC tooltip + new bottom helper line; closed-trade tab shows the same set on the open section; Excel tab renders without errors; 244/244 vitest tests pass; no console errors.
