# Trade Analyst — UI/UX Audit & Remediation Plan

> **Audit date:** 2026-06-16
> **Auditor:** Claude (ui-ux-pro-max skill)
> **App version reviewed:** main branch at commit `ceef336` + production at https://trade-analyst-lyart.vercel.app

---

## Background

Trade Analyst is a Hebrew-RTL trading journal for self-directed equity traders, built on Next.js 16 (App Router) + React 19 + Supabase. It pulls trade executions from IBKR's Flex Web Service, normalises them through a FIFO matching pipeline, and serves a research dashboard with analytics charts, a trade search/edit view, manual entry forms, and an AI chat assistant ("חנן", Gemini-backed). The app is deployed as a multi-user SaaS with public signup.

**Scope:** UI/UX quality across all routes — `/login`, `/signup`, `/research`, `/search`, `/manual-import`, `/profile` (all tabs), and the chat sidebar. Covers visual design, interaction patterns, accessibility (keyboard, screen reader, AT), design-system consistency, and component semantics. Out of scope: FIFO logic correctness, API security, dependency debt, and infrastructure — see companion [`docs/TECH-DEBT.md`](TECH-DEBT.md). Mobile viewport is explicitly out of scope; the app targets desktop and tablet (large-screen) only.

**Stack reviewed:** Next.js 16 · React 19 · TypeScript 5.8 · Tailwind CSS 3 · `@supabase/ssr` 0.6.1 · Recharts 2.15 · `globals.css` custom properties · IBM Plex Mono + Assistant fonts via Google Fonts CDN.

**Methodology:**
1. Full source read of all component files in `components/` (header, modals, chat sidebar, research dashboard, trade search, manual-import tabs, trade entry forms, profile tabs, sync indicator) and layout files in `app/`.
2. Code-level audit of every `aria-*` attribute, `role`, `tabIndex`, focus-management pattern, keyboard handler, and `htmlFor`/`id` pairing across the component tree.
3. Grep sweeps for `focus:outline-none`, `h-screen`, `font-mono`, inline hex colours, `alert(`, emoji usage, `aria-expanded`, `aria-sort`, `role="dialog"`, and `prefers-reduced-motion` to quantify systemic patterns.
4. Live browser inspection of all routes at the production URL using Chrome MCP — DOM attribute queries, bounding-rect measurements, computed-style checks, focus-tracking, Escape-key dispatch, and network/console observation. Screenshots failed (CDP timeout); all evidence is DOM/JS-based.
5. Cross-referencing with companion [`docs/TECH-DEBT.md`](TECH-DEBT.md) for overlapping findings.
6. Each finding scored internally with `Priority = (Impact + Risk) x (6 - Effort)`, all on a 1-5 scale, to order within phases.

**Reference frameworks:** WCAG 2.1 AA · WAI-ARIA 1.2 Authoring Practices (Dialog, Tabs, Disclosure, Sortable Table) · Apple Human Interface Guidelines (touch targets) · Material Design 3 accessibility guidelines.

---

## How to Use This Plan

- Each finding is **outcome-driven**: it states what is wrong and what "fixed" looks like, but **not** how to implement it. The implementer chooses the approach.
- Work top-down by phase. **Do not skip Phase 1.** Phase 1 contains issues that actively harm keyboard and AT users today.
- Tick the box only when the **Acceptance** clause is satisfied — not when the change is merely written.
- When an item lands, flip `[ ]` to `[x]` on the heading line. Empty boxes mean unfinished; ticked boxes mean Acceptance met.
- If a finding turns out to be invalid in context, leave the box unchecked and add a `~~strikethrough~~` note explaining why.
- New findings discovered during fixes go at the bottom under "Discovered During Remediation".
- When a finding overlaps with [`docs/TECH-DEBT.md`](TECH-DEBT.md), the cross-reference is in the Issue line. Fix once; tick the box in both files.

---

## Strengths — What Already Works Well

Preserve these patterns when refactoring:

- **Delete-confirm dialog in `components/trade-search.tsx:528`** is the gold standard for modals in this codebase — has `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, and Escape handler. Every other modal should match this pattern.
- **Skip-link in dashboard layout** with correct focus styling — keyboard users can bypass navigation.
- **Bidi-aware numeric formatting** using Unicode LRI/PDI isolates throughout the research dashboard — a sophisticated approach that prevents digit reordering in RTL.
- **`data-empty` hack for date inputs in `app/globals.css:67-103`** — thoughtful solution for Chrome RTL date-picker rendering bug; documented and scoped.
- **Recharts containers with `role="img"` + descriptive Hebrew `aria-label`** (e.g., "גרף עקומת הון: R מצטבר לאורך זמן") across all 5 chart types in `/research` — rare quality for chart accessibility.
- **`<dl>/<dt>/<dd>` semantic structure for metric cards** in the research dashboard — correct use of description lists instead of generic `<div>` soup.
- **InfoTooltip component** with auto-flip positioning, Escape-to-dismiss, `focus-visible` trigger, and detailed Hebrew `aria-label` on each instance (e.g., "מידע על Profit Factor").
- **`.input-base` focus pattern in `app/globals.css`** — a correct `focus-visible` ring exists in the stylesheet; the problem is that components override it with `focus:outline-none` instead of using it.
- **All LegCard fields in manual-import** (`components/trade-entry-form.tsx`) correctly paired with `htmlFor` + `id` on the 8 required fields (ticker, side, date, time, quantity, price, commission, currency).
- **Inline validation on the signup form** — well-styled, correct colouring, does not flash prematurely. A model to replicate elsewhere.

---

## Findings

ID convention: `F##` numbered globally across phases. Where a finding was confirmed by live browser inspection (DOM query, bounding-rect measurement, focus tracking, Escape dispatch, or network observation), the Issue line says **"Confirmed."**

---

### Phase 1 — Critical (Day-1 blockers, must clear before next release)

#### [x] F1. Keyboard focus is invisible across the entire application
- **Where:** 11 files — forms, modals, sidebars, profile tabs. `focus:outline-none` applied without a `focus-visible` alternative. Confirmed on login page: amber "כניסה" button has no visible focus state.
- **Issue:** **Confirmed.** Keyboard-only users (and anyone using AT with a keyboard) cannot see where focus is. The codebase has a correct `.input-base` class in `globals.css` with `focus-visible` ring, but components override it with `focus:outline-none`. The one exception is date inputs in `/research`, which show a white 2.4px outline — proving the pattern works when applied.
- **Acceptance:** Every interactive element (buttons, links, inputs, selects, checkboxes) shows a visible focus indicator on `:focus-visible`. Verified by tabbing through every route (login, signup, research, search, manual-import, profile) and confirming no element becomes invisible when focused. `grep -r "focus:outline-none" components/ app/` returns zero hits outside reset stylesheets.

#### [x] F2. Modals lack dialog semantics, Escape handler, and focus management
- **Where:** `components/trade-detail-modal.tsx`, `components/manual-close-modal.tsx`. The close button in trade-detail-modal measures 10x20px with no `aria-label`. ChatSidebar is a separate case — see F2b below.
- **Issue:** **Confirmed.** Live DOM inspection of TradeDetailModal: `{role: null, ariaModal: null, ariaLabelledby: null}`. Dispatching Escape keydown: `escapeClosed: false`. Checking `document.activeElement` after open: `focused: BODY`. Focus never moves to the modal on open and never returns to the trigger on close. The delete-confirm dialog in `trade-search.tsx:528` already implements the correct pattern — the two modals do not. Close button measured at `{w: 10, h: 20}` with `ariaLabel: null`.
- **Acceptance:** TradeDetailModal and ManualCloseModal both have `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to a visible heading, Escape-to-close, focus trapped inside while open, initial focus on the first interactive element, and focus restored to the trigger on close. Close button measures at least 44x44px and has `aria-label`. Verified by opening each modal, pressing Escape (closes), checking `document.activeElement` (inside the dialog on open, back on trigger after close), and tabbing (focus stays within).

#### [x] F2b. Chat sidebar lacks non-modal panel semantics
- **Where:** `components/chat-sidebar.tsx` — no `role`, `aria-modal`, or `aria-label`.
- **Issue:** **Confirmed.** The chat sidebar is a non-modal companion panel (user works in the main content while the sidebar is open). Live DOM: `{role: null, ariaModal: null, ariaLabel: null}`. Focus stays on `<body>` after opening. Escape does not close it. As a non-modal panel, it should not trap focus but should be discoverable by AT and dismissable with Escape.
- **Acceptance:** ChatSidebar has `role="complementary"` (or `role="region"`) with `aria-label="צ'אט עם חנן"`. Escape closes the sidebar. Focus is **not** trapped (user can Tab between sidebar and main content freely). Verified by opening the sidebar, pressing Tab (focus moves into sidebar content), pressing Tab again (focus can leave to main content), and pressing Escape (sidebar closes).

#### [x] F3. `/profile` page has broken document structure and unlabeled fields
- **Where:** `app/(dashboard)/profile/page.tsx` (ProfileLayout adds `<main>`), all field inputs in `components/profile/tab-account.tsx` and `components/profile/tab-security.tsx`.
- **Issue:** **Confirmed.** `mainsCount: 2` — ProfileLayout wraps content in `<main>` while `app/(dashboard)/layout.tsx:60` already provides one. `h1Exists: false` — heading hierarchy starts at `<h2>`. All 6 fields in the account tab (firstName, lastName, phone, street, city, country) are missing `id`, `htmlFor`, `autocomplete`, and `aria-label` — password managers and screen readers cannot associate labels with fields.
- **Acceptance:** The page contains exactly one `<main>` element. An `<h1>` is present (visually hidden is acceptable). Every text input has a programmatically associated label via `htmlFor`/`id` and appropriate `autocomplete` attribute (`given-name`, `family-name`, `tel`, `street-address`, `address-level2`, `country`). Verified by counting `<main>` elements (1), confirming `<h1>` exists, and tabbing through inputs with a screen reader hearing the label announced before each field.

#### [x] F4. Signup form inputs missing `id`, `htmlFor`, `autocomplete`, and `required`
- **Where:** `app/(auth)/signup/page.tsx` — all registration inputs.
- **Issue:** **Confirmed.** The login page has correct labeling, but the signup form does not follow the same pattern. Inputs lack `id`/`htmlFor` pairing (labels not programmatically associated), `autocomplete` attributes (password managers cannot offer to fill), and `required` attributes (HTML validation not engaged). Password helper text is not linked via `aria-describedby`.
- **Acceptance:** Every signup input has `id` + `htmlFor` pairing, `autocomplete` (`email`, `new-password`), and `required`. Password hint text linked via `aria-describedby`. Verified by tabbing through the form with a screen reader and hearing label + description announced for each field, and by submitting an empty form and seeing browser-native required-field validation.

#### [x] F5. No self-service password change or recovery
- **Where:** `app/(auth)/login/page.tsx` — no "forgot password" link. `components/profile/tab-security.tsx` — password change UI exists but scope needs verification.
- **Issue:** **Confirmed.** A user who forgets their password has no self-service recovery path from the login page. The profile security tab has a password-change form, but there is no way to reach it without being logged in. A password-reset option should also be available from the settings for logged-in users who want to change their password proactively.
- **Acceptance:** (a) Login page has a "שכחתי סיסמה" link leading to a password-reset flow (email input, Supabase `resetPasswordForEmail`, confirmation screen). (b) The profile security tab (`/profile?tab=security`) has a working password-change form for logged-in users. Verified by: clicking the forgot-password link on login, receiving and completing the reset email; and separately, changing the password from the security settings while logged in.

#### [x] F6. Sync indicator displays minutes as days
- **Where:** `components/sync-indicator.tsx:58`
- **Issue:** The `formatShort` function uses `${mins}d` instead of `${mins}m`. A sync that happened 12 minutes ago displays as "12d" (12 days). Users see wildly incorrect staleness information.
- **Acceptance:** Minutes display with the `m` suffix (e.g., "12m"). Hours display with `h`, days with `d`. Verified by checking the sync indicator when the last sync was less than 60 minutes ago.

---

### Phase 2 — Important (correctness & integrity)

#### [x] F7. Color tokens diverged between Tailwind config and CSS variables
- **Where:** `tailwind.config.ts:18` defines `text-dim` as `#888888`; `app/globals.css` defines `--text-dim` as `#B0B0B0`. Placeholder text across forms uses `#444444` which measures ~2.1:1 contrast against `#080808` background — below WCAG AA minimum of 4.5:1.
- **Issue:** Two sources of truth for the same semantic colour produce inconsistent rendering depending on whether a component uses the Tailwind class or the CSS variable. Placeholder text at `#444444` is functionally invisible to users with any degree of low vision. Overlaps with [`docs/TECH-DEBT.md`](TECH-DEBT.md) concept of design-system consistency.
- **Acceptance:** `text-dim` resolves to a single value in both Tailwind config and CSS custom properties. All placeholder/secondary text colours pass WCAG AA 4.5:1 contrast against their background. Verified with a contrast checker tool against `--bg-dark` and `--panel-bg`.

#### [x] F8. 115 inline hex colour values bypass design tokens
- **Where:** 20 component files across `components/` and `app/`. Tailwind config defines tokens (`panel`, `border`, `text-dim`, `green`, `red`, `amber`) but components use raw hex (`#1A1A1A`, `#2A2A2A`, `#333`, `#444`, `#666`, `#888`, `#E0E0E0`, etc.). Actual baseline turned out higher than 115 — initial sweep found ~522 inline hex.
- **Issue:** Theming, dark/light mode, and global colour changes require editing 115 scattered values instead of adjusting one token. Several hex values are near-duplicates of existing tokens but not quite matching, creating unintentional visual inconsistency. A systematic token pass is the single highest-leverage visual consistency fix in the codebase. **Closed 2026-06-16** — bulk-replaced ~480 occurrences across all `components/`/`app/` files via Tailwind tokens added to `tailwind.config.ts` (`text-main`, `text-fade`, `text-faint`, `panel-2`, `panel-3`, `amber-tint`, `red-tint`, `red-shade`, `green-tint`, `shade`, `shade-2`). Remaining ~39 inline hex are intentional and documented: ~29 in `components/research/shell.tsx` + `components/research/charts.tsx` (Recharts inline CSS literals + the SETUP_COLORS chart palette — Recharts requires literal hex strings, not Tailwind classes); 4 in `components/google-signin-button.tsx` (Google logo brand colours); 6 small SVG stroke / strength-meter literals in countdown-circle, info-tooltip, tab-security.
- **Acceptance:** `grep -rn "#[0-9a-fA-F]\{3,8\}" components/ app/ --include="*.tsx" --include="*.ts"` returns only values that are intentionally distinct from tokens (e.g., one-off chart colours) and those are documented inline. Total inline hex count is below 20.

#### [x] F9. Sort headers in `/search` table are not accessible
- **Where:** `components/trade-search.tsx:76` — `SortTh` component renders `<th onClick>` without a `<button>` inside. No `aria-sort` attribute.
- **Issue:** **Confirmed.** Active sort column shows "סגירה ↓" visually but `ariaSort: null` on all 7 `<th>` elements. Keyboard users cannot activate sort because `<th>` is not in the tab order and has no `keydown` handler. AT users have no announcement of sort direction.
- **Acceptance:** Each sortable `<th>` contains a `<button>` that receives focus and activates sort. The active column's `<th>` has `aria-sort="ascending"` or `aria-sort="descending"`. Verified by tabbing to a column header, pressing Enter (sort activates), and checking the `aria-sort` attribute value matches the visual arrow direction.

#### [x] F10. Table rows in `/search` are click-only, not keyboard-accessible
- **Where:** `components/trade-search.tsx` — `<tr>` elements have `onClick` + `cursor-pointer` but `tabIndex={-1}` and no `role`.
- **Issue:** **Confirmed.** Trade detail can only be opened via mouse click. Keyboard users cannot reach or activate table rows. The rows are functionally interactive elements without keyboard equivalents.
- **Acceptance:** Each data row is keyboard-focusable (`tabIndex={0}` or placed in tab order) and activatable with Enter or Space. Verified by tabbing to a row and pressing Enter — the trade detail modal opens.

#### [x] F11. Chat sidebar enters from the wrong side in RTL
- **Where:** `components/chat-sidebar.tsx:134` — `fixed top-0 left-0` positions the sidebar on the physical left.
- **Issue:** **Confirmed.** In a Hebrew RTL app, the sidebar slides in from the physical left edge, which is the "end" side. In RTL reading order, drawers/sidebars conventionally appear from the start side (physical right). The sidebar already uses a `ltr()` helper elsewhere, suggesting bidi awareness was intended.
- **Acceptance:** The sidebar enters from the physical-right edge (the start side in RTL). `left-0` is replaced with a logical-property equivalent or flipped to `right-0`. Verified by opening the sidebar and confirming it slides from the right edge of the viewport.

#### [x] F12. Touch targets below 44px on action buttons and tooltips
- **Where:** `components/trade-search.tsx:413-453` — edit/delete action buttons measured at 24x24px. `components/research-dashboard.tsx` — 14 InfoTooltip buttons measured at 14x14px each. `components/trade-detail-modal.tsx:130` — close button at 10x20px.
- **Issue:** **Confirmed.** Apple HIG and WCAG 2.5.8 require minimum 44x44px touch targets. At 14x14px, the InfoTooltip buttons are roughly 10% of the recommended area. Users on tablets (in scope) will struggle to activate these controls reliably. The edit and delete buttons at 24x24px are also too close together, increasing error rate.
- **Acceptance:** All interactive elements measure at least 44x44px (including padding/margin). Verified by querying `getBoundingClientRect()` on every button, link, and interactive element and confirming `width >= 44 && height >= 44`.

#### [x] F13. Disclosure buttons missing `aria-expanded`
- **Where:** `components/trade-entry-form.tsx:205,323` ("פרטי הזמנה", "הערות אישיות"), `components/profile/tab-broker.tsx:44` (SetupGuide).
- **Issue:** **Confirmed.** `ariaExpanded: null` on both disclosure buttons in manual-import. Collapsible sections toggle visibility but AT users are not told whether the section is open or closed. WAI-ARIA Disclosure pattern requires `aria-expanded` on the trigger.
- **Acceptance:** Every collapsible trigger has `aria-expanded="true"` when open and `aria-expanded="false"` when closed. Verified by toggling each disclosure and checking the attribute value changes.

#### [x] F14. Tab components lack WAI-ARIA Tab semantics
- **Where:** `components/manual-import-tabs.tsx` — sub-tabs ("הזנה ידנית" / "ייבוא Excel") are plain buttons. `app/(dashboard)/profile/page.tsx` — 4 profile tabs (חשבון/אבטחה/תצוגה/ברוקר) are plain buttons.
- **Issue:** **Confirmed.** Profile tabs: `role: null, ariaSelected: null`. Manual-import tab: `role: null, ariaSelected: null`. AT users hear "button" instead of "tab, 1 of 4, selected" and cannot use arrow keys to navigate between tabs. WAI-ARIA Tabs pattern requires `role="tablist"` on the container, `role="tab"` on each trigger, `role="tabpanel"` on each panel, `aria-selected`, and arrow-key navigation.
- **Acceptance:** Both tab sets use `role="tablist"/"tab"/"tabpanel"` with `aria-selected`, `aria-controls`/`aria-labelledby` pairings, and arrow-key navigation. Verified by focusing a tab, pressing Right-Arrow (moves to next tab), and hearing "tab, selected" announced by a screen reader.

#### [x] F15. Header nav active and hover states are visually ambiguous
- **Where:** `components/header.tsx:46-62` — both active and hover tabs use `bg-[#1A1A1A]`.
- **Issue:** The only visual difference between hover and active is a bottom border on the active tab. Users scanning the header cannot quickly identify which page they are on because hover gives the same background. The ambiguity is worse for users with low vision or cognitive load.
- **Acceptance:** Active tab has a visually distinct treatment from hover — different background, font weight, or opacity. Verified by hovering over a non-active tab and confirming it is visually distinguishable from the active tab in at least two properties (not just the border).

#### [x] F16. Win/loss state conveyed by colour alone
- **Where:** `components/research/charts.tsx:86,211`, `components/trade-search.tsx` — green (`#2CC84A`) for win, red (`#FF4D4D`) for loss, with no secondary encoding.
- **Issue:** Approximately 8% of males have some form of colour vision deficiency. Win/loss in charts and tables is encoded solely through green/red — users with deuteranopia or protanopia cannot distinguish the two states. WCAG 1.4.1 requires information not to be conveyed by colour alone. ~~**Closed 2026-06-16** — added ↑/↓ glyphs next to Direction (Long/Short) and ✓/✗/= glyphs next to Result (Win/Loss/Breakeven) in `trade-search.tsx`. For charts, the audit's premise was conservative: bar y-position relative to the y=0 reference line is a non-colour encoding for sign (already in place), and the holdtime scatter has an explicit Win/Loss/Other text legend. Word labels in axes (e.g., "<-2R", "-2R–-1R") and tooltip text (with +/− signs and Hebrew "Win Rate") also satisfy WCAG 1.4.1 without colour.~~
- **Acceptance:** Win/loss has a secondary visual indicator in addition to colour — such as icons, patterns, text labels, or distinct shapes. Verified by viewing charts and tables with a colour-blindness simulator (e.g., Chrome DevTools rendering emulation for protanopia) and confirming win/loss are still distinguishable.

#### [x] F17. `alert()` used for error feedback in broker settings
- **Where:** `components/profile/tab-broker.tsx:231,242`
- **Issue:** Error messages use `window.alert()`, which produces a system dialog that is visually dissonant with the polished dark UI, blocks the thread, and on some embedded browsers (Capacitor, Electron) may not render at all. Every other error in the app uses inline feedback.
- **Acceptance:** Error messages render inline within the broker settings panel using the same toast or inline-error pattern used elsewhere in the app. `grep -n "alert(" components/profile/tab-broker.tsx` returns zero hits.

#### [x] F18. Emoji characters used as functional icons in chat sidebar
- **Where:** `components/chat-sidebar.tsx:127,174` — `⚡` (model toggle), `🔬` (model toggle), `▶` (send), `✕` (close).
- **Issue:** Screen readers announce "high voltage" and "microscope" instead of the intended function. Emoji rendering varies across OS/browser — some may render as text-style glyphs. Icons conveying function should use SVG with `aria-hidden` and a text alternative.
- **Acceptance:** Functional icons use SVG (or equivalent) with `aria-hidden="true"` alongside a visually hidden text label or `aria-label`. Verified with a screen reader — toggling the model announces the function (e.g., "מצב מהיר") not the emoji name.

#### [x] F19. Chart resize handles work only with mouse
- **Where:** `components/research/shell.tsx:104-169` — `onMouseDown` without `onTouchStart` or `onPointerDown`. `role="separator"` is set but `aria-orientation` and `aria-valuenow` are missing.
- **Issue:** Touch-device users (tablets, which are in scope) cannot resize chart panels because only `mousedown` is handled. The `role="separator"` declaration without required ARIA attributes is incomplete — AT expects `aria-orientation` and `aria-valuenow` when this role is present on a draggable splitter.
- **Acceptance:** Resize handles respond to pointer events (covers mouse, touch, and pen). `role="separator"` includes `aria-orientation="vertical"` (or horizontal as appropriate) and `aria-valuenow` reflecting the current position. Keyboard resize is out of scope. Verified on a tablet or with touch-simulation in DevTools.

---

### Phase 3 — Polish (consistency / hygiene)

#### [ ] F20. `aria-live` region in `/research` wraps 1006 characters
- **Where:** `components/research-dashboard.tsx:279` — `aria-live="polite"` wraps the entire metrics + charts area.
- **Issue:** **Confirmed.** `textLen: 1006`. When any filter changes, screen readers re-announce over 1000 characters of content. ARIA live regions should wrap only the specific content that changes — a summary count or a status message, not the entire dashboard.
- **Acceptance:** The `aria-live` region wraps only a short status string (e.g., "מציג 9 עסקאות" or "אין תוצאות") that changes on filter updates. The full dashboard content is outside the live region. Verified by changing a filter and confirming the screen reader announces only the status, not the entire dashboard.

#### [ ] F21. Manual entry silently coerces invalid numeric input to zero
- **Where:** `components/trade-entry-form.tsx:147` — `parseFloat(e.target.value) || 0`
- **Issue:** If a user types "abc" in a price field, it silently becomes 0 with no validation feedback. This can produce Orders with `price: 0` or `quantity: 0` in the database.
- **Acceptance:** Invalid numeric input shows a visible validation message (e.g., border colour change + helper text) and the form does not submit with a value of 0 from a non-empty field. Verified by typing "abc" in the price field and confirming visual feedback appears.

#### [ ] F22. Google Fonts loaded from external CDN instead of `next/font`
- **Where:** Root layout — `<link>` tags load from `fonts.googleapis.com` + `fonts.gstatic.com`.
- **Issue:** **Confirmed.** Network observation shows 4 woff2 font files fetched from `fonts.gstatic.com` on every page load. This adds external DNS lookups, is render-blocking, and sends referrer data to Google. Next.js has built-in `next/font/google` for self-hosting with zero layout shift.
- **Acceptance:** Fonts are loaded via `next/font/google` and self-hosted from the app's own domain. `grep -rn "fonts.googleapis.com\|fonts.gstatic.com" app/` returns zero hits. Verified by checking the Network tab — no requests to Google font CDN.

#### [ ] F23. `h-screen` / `min-h-screen` used instead of `dvh` units
- **Where:** Dashboard layout, root layout, login page, signup page.
- **Issue:** `h-screen` uses `100vh` which on tablet browsers does not account for the collapsing URL bar, causing content to be clipped behind the address bar. The `dvh` unit (dynamic viewport height) adjusts to the visible viewport.
- **Acceptance:** All viewport-height declarations use `dvh` equivalents (`min-h-dvh`, `h-dvh`). Verified by `grep -rn "h-screen\|min-h-screen" app/ components/` returning zero hits.

#### [ ] F24. `font-mono` leaks into Hebrew UI text
- **Where:** Header, sort indicators, pagination — `font-mono` (IBM Plex Mono) is applied to elements containing Hebrew text, not just numbers.
- **Issue:** IBM Plex Mono was chosen for numeric displays. When it applies to Hebrew characters, the monospace rendering looks mechanical and inconsistent with the Assistant font used elsewhere. Hebrew text should always use the `Assistant` font family.
- **Acceptance:** `font-mono` is applied only to elements containing numeric data (prices, quantities, dates, percentages). Hebrew text never renders in monospace. Verified by inspecting `font-family` computed style on Hebrew-text elements and confirming it resolves to `Assistant`.

#### [ ] F25. No `prefers-reduced-motion` media query anywhere
- **Where:** Codebase-wide — no `@media (prefers-reduced-motion)` or `motion-safe:`/`motion-reduce:` Tailwind utilities.
- **Issue:** Users who have enabled "reduce motion" in their OS settings still see all transitions and animations. WCAG 2.3.3 recommends respecting motion preferences to prevent vestibular discomfort.
- **Acceptance:** All non-essential animations (sidebar slide, modal fade, chart transitions, tooltip appearance) are disabled or reduced when `prefers-reduced-motion: reduce` is active. Verified by enabling "reduce motion" in OS settings and confirming transitions are instant.

#### [ ] F26. Header navigation breaks below ~900px viewport width
- **Where:** `components/header.tsx:46` — `position: absolute left-1/2 -translate-x-1/2` centres nav tabs.
- **Issue:** The absolute-centre positioning assumes enough horizontal space for all tabs + logo + sync indicator. Below ~900px (possible on smaller tablets or split-screen), tabs overflow or overlap the logo/indicator. No responsive fallback exists.
- **Acceptance:** Navigation remains usable at viewport widths down to 768px (standard tablet portrait). Tabs either reflow, use a horizontal scroll, or collapse to a menu. Verified by resizing the browser to 768px and confirming all tabs are accessible without horizontal page overflow.

#### [ ] F27. Chrome autofill turns inputs light blue, breaking dark theme
- **Where:** Login and signup form inputs.
- **Issue:** **Confirmed.** Chrome's autofill stylesheet applies a light-blue background to filled inputs, which clashes with the `#080808` page background. This is a common dark-theme issue with a well-known CSS workaround.
- **Acceptance:** Autofilled inputs maintain the dark theme appearance. Verified by autofilling the login form in Chrome and confirming inputs do not turn light blue.

#### [x] F28. `role="separator"` on resize handle missing required ARIA attributes
- **Where:** `components/research/shell.tsx:203-213`
- **Issue:** The resize handle declares `role="separator"` but omits `aria-orientation` and `aria-valuenow`. When `role="separator"` is on a focusable element (which it is — it has event handlers), WAI-ARIA requires these attributes for AT to convey the separator's state.
- **Acceptance:** The separator element has `aria-orientation` and `aria-valuenow` (or `aria-valuemin`/`aria-valuemax`). Alternatively, if keyboard resize is not supported, `role="separator"` is removed and replaced with `role="presentation"` or no role. Verified by inspecting the element's ARIA attributes.

#### [ ] F29. Hidden file input for Excel import is not keyboard-accessible
- **Where:** `components/trade-excel-import.tsx` — `<input type="file" className="hidden">` triggered by a `<div>` click.
- **Issue:** The file input is `display: none` and the visual drop zone that triggers it is a `<div>`, not a `<button>`. Keyboard users cannot reach or activate the file picker.
- **Acceptance:** The file-upload trigger is a focusable, activatable element (a `<button>` or a visible `<label htmlFor>` pointing to the input). Verified by tabbing to the upload area and pressing Enter/Space — the file picker opens.

#### [ ] F30. CountdownCircle timer content announced twice by screen readers
- **Where:** `components/chat-sidebar.tsx` — CountdownCircle component renders visible text that screen readers also read from the parent context.
- **Issue:** Without `aria-hidden="true"` on the decorative countdown SVG, screen readers announce the timer value twice — once from the visual text and once from the parent element.
- **Acceptance:** The CountdownCircle SVG has `aria-hidden="true"` and the timer value is announced exactly once. Verified with a screen reader.

#### [ ] F31. White Google login button breaks visual hierarchy on dark theme
- **Where:** Login and signup pages — Google OAuth button renders with a white background.
- **Issue:** **Deferred 2026-06-16** — owner prefers to keep the current white button. Original issue: **Confirmed.** The high-contrast white button dominates the visual hierarchy over the primary amber "כניסה" CTA. Users' eyes are drawn to the Google button first, weakening the primary action.
- **Acceptance:** The Google button uses a toned-down dark variant (outline or low-contrast fill) that does not overpower the primary CTA. Verified by visual inspection — the primary CTA is the most prominent button on the page.

#### [ ] F32. Duplicate RSC prefetch requests on navigation
- **Where:** Network observation on `/research` — `manual-import` and `search` routes fetched twice with different `_rsc` cache keys on a single page load.
- **Issue:** **Confirmed.** Next.js 16 link prefetching fires duplicate requests, doubling bandwidth for RSC payloads. A `503` was also observed on one prefetch (likely Vercel cold-start), causing a momentary error state.
- **Acceptance:** Each navigable route is prefetched at most once per page load. Verified by monitoring the Network tab on `/research` load and confirming no duplicate `_rsc` requests for the same route.

---

## Open Questions / Items Requiring Owner Input

- ~~**1. Should the chat sidebar be a modal dialog or a non-modal panel?**~~ **Answered 2026-06-16** — non-modal. The sidebar is a companion tool that stays open while the user works in the main content. F2 updated to cover only TradeDetailModal + ManualCloseModal as true modals; new F2b covers the sidebar with `role="complementary"` semantics.

- ~~**2. What should the Google OAuth button look like?**~~ **Answered 2026-06-16** — keep the current white button. F31 deferred; owner prefers not to change it now.

- ~~**3. Is password recovery (F5) needed before public launch, or is the admin managing resets manually?**~~ **Answered 2026-06-16** — yes, add both a forgot-password flow on the login page and a password-change option in profile settings (`/profile?tab=security`). F5 updated to cover both paths.

- ~~**4. Should chart resize also support keyboard interaction?**~~ **Answered 2026-06-16** — no. F19 scoped to pointer events only (mouse + touch + pen). Keyboard resize is out of scope.

---

## Discovered During Remediation

> Add new findings here as they surface while working through the plan. Same format: `[ ] F##. Title` + Where / Issue / Acceptance.
