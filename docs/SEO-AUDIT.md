# Trade Analyst — SEO Audit & Remediation Plan

> **Audit date:** 2026-07-09
> **Auditor:** Claude (searchfit-seo:seo-audit skill)
> **App version reviewed:** main branch at commit `d949e26` + production at https://tradeanalyst.app
> **Status:** ✅ COMPLETED 2026-07-09 — all 12 findings closed (with S8 and S10 deferred by owner decision and marked accordingly). Open questions answered inline. Discovered finding S12 closed. Re-open by changing Status to ACTIVE and adding new findings under "Discovered During Remediation".

---

## Background

Trade Analyst is a Hebrew RTL trading journal with an AI assistant ("חנן"), built on Next.js 16 App Router + React 19 + Supabase and deployed on Vercel. It targets Israeli retail traders and offers IBKR sync, FIFO analytics, manual/Excel import, and an AI chat sidebar. The site is a multi-user SaaS with public signup.

**Scope:** This audit covers the six publicly indexable pages (/, /login, /signup, /forgot-password, /terms, /privacy) and their SEO signals: meta tags, headings, structured data, crawlability, internal linking, images, performance signals, and mobile/accessibility basics. It does not cover authenticated dashboard pages (blocked by robots.txt), paid search/SEM, backlink profile, or domain authority. Content marketing strategy is noted as an opportunity but not audited in depth.

**Stack reviewed:** Next.js 16 App Router · React 19 · Tailwind CSS · Supabase Auth · Vercel hosting · next/font (self-hosted Assistant + IBM Plex Mono) · `@vercel/og` (OG image generation)

**Methodology:**
1. Full source read of every public-facing `page.tsx`, `layout.tsx`, `robots.ts`, `sitemap.ts`, and `app/og/route.tsx`.
2. Live fetch of `https://tradeanalyst.app/`, `/robots.txt`, `/sitemap.xml`, `/login`, `/signup`, and `/terms` to verify rendered meta tags and headings match source expectations.
3. Grep across all components for `alt=`, `<img`, `<Image`, `JsonLd`, `schema.org`, `application/ld+json`, and `export const metadata` to check coverage.
4. Cross-referenced robots.txt allow list against sitemap entries for consistency.
5. Each item scored with `Priority = (Impact + Risk) x (6 - Effort)`, all on a 1-5 scale.

**Reference frameworks:** Google Search Quality Rater Guidelines · Google Structured Data documentation · WCAG 2.1 AA (for SEO-adjacent accessibility signals) · Core Web Vitals · schema.org vocabulary

---

## How to Use This Plan

- Each finding is **outcome-driven**: it states what is wrong and what "fixed" looks like, but **not** how to implement it. The implementer chooses the approach.
- Work top-down by phase. **Do not skip Phase 1.** Phase 1 contains issues that directly reduce search visibility or produce poor search result snippets.
- Tick the box only when the **Acceptance** clause is satisfied — not when the change is merely written.
- When an item lands, flip `[ ]` → `[x]` on the heading line. Empty boxes mean unfinished; ticked boxes mean Acceptance met.
- If a finding turns out to be invalid in context, leave the box unchecked and add a `~~strikethrough~~` note explaining why.
- If a finding is deferred by an owner decision (won't-fix this round), tick `[x]`, wrap the Acceptance line in `~~strikethrough~~`, and append a short note explaining the decision.
- New findings discovered during fixes go at the bottom under "Discovered During Remediation".

---

## Strengths — What Already Works Well

Preserve these patterns when implementing fixes:

- `app/robots.ts` programmatically generates robots.txt with correct allow/disallow segmentation — all dashboard and API routes are blocked, all public pages are explicitly allowed.
- `app/sitemap.ts` programmatically generates sitemap.xml with differentiated `changeFrequency` and `priority` values, and is referenced from robots.txt.
- Root layout (`app/layout.tsx:28-63`) has a well-structured `Metadata` export with `metadataBase`, title template (`%s · Trade Analyst`), OG tags (type, locale, url, siteName, image), and Twitter Card config.
- OG image (`app/og/route.tsx`) is a custom edge-rendered image with branding, stat cards, and aggressive `Cache-Control: immutable` headers — no redundant re-renders on social preview scrapes.
- Fonts are self-hosted via `next/font` (`app/layout.tsx:10-22`) with `display: 'swap'` — zero layout shift, no external DNS lookup to fonts.googleapis.com.
- `<html lang="he" dir="rtl">` is correctly set at the root level, signaling language and text direction to search engines.
- The landing page (`app/page.tsx`) is a server component — no client-side JS needed for initial render, which benefits Core Web Vitals (LCP, FID).
- Logo image uses `next/image` with proper `alt="Trade Analyst logo"` in `components/trade-logo.tsx:14`.
- Landing page video uses `preload="metadata"` and `aria-label` for accessibility (`components/landing/landing-video.tsx:56-69`).
- Terms and Privacy pages (`app/(public)/terms/page.tsx`, `app/(public)/privacy/page.tsx`) both export dedicated `metadata` objects with unique titles and descriptions.

---

## Findings

ID convention: `S##` numbered globally across phases. Where a finding was confirmed by reading the deployed response or running the code path, the `Issue` line says **"Confirmed."**

---

### Phase 1 — Critical (must clear before next release)

#### [x] S1. Root meta description is too short to appear usefully in search results
- **Where:** `app/layout.tsx:34` — `description: SITE_TAGLINE` where `SITE_TAGLINE = 'יומן מסחר חכם עם AI'`
- **Issue:** **Confirmed.** The root meta description is approximately 20 characters. Google recommends 150-160 characters for the description snippet. The current text tells nothing about IBKR integration, FIFO analytics, Hebrew RTL support, or what differentiates the product. Google may auto-generate a snippet from page content instead, which is unpredictable and often poor.
- **Acceptance:** The root meta description is 120-160 characters, mentions the core value proposition (trading journal, analytics, IBKR sync, AI assistant), and reads naturally in Hebrew. Verified by fetching `https://tradeanalyst.app/` and inspecting the `<meta name="description">` tag.

#### [x] S2. Auth pages inherit generic title and description — four pages with identical metadata
- **Where:** `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx` — all are `'use client'` with no `export const metadata`.
- **Issue:** **Confirmed.** All four auth pages render with the root title "Trade Analyst" and the short root description. Google sees four indexable pages (all are in the robots.txt allow list and sitemap) with identical title+description, which dilutes ranking signals and produces indistinguishable search result entries. The title template `%s · Trade Analyst` is available but none of these pages supply the `%s` portion.
- **Acceptance:** Each auth page has a unique title and description. Specifically: `/login` title contains "כניסה", `/signup` contains "הרשמה", `/forgot-password` contains "שכחתי סיסמה", `/reset-password` contains "איפוס סיסמה". Verified by fetching each URL and confirming distinct `<title>` and `<meta name="description">` values.

#### [x] S3. No JSON-LD structured data on any page
- **Where:** Entire codebase — grep for `application/ld+json`, `JsonLd`, and `schema.org` returns zero results.
- **Issue:** No structured data markup exists anywhere. The landing page FAQ section is a strong candidate for `FAQPage` schema (5 Q&A pairs already structured as `<details>` elements). The site as a whole lacks `Organization` and `WebSite` schema that help Google build knowledge graph entries and enable sitelinks search box. For a SaaS product, `SoftwareApplication` schema would surface pricing and rating eligibility in rich results.
- **Acceptance:** The landing page emits valid `FAQPage` and `Organization` JSON-LD in a `<script type="application/ld+json">` tag. Verified by pasting the page URL into Google's Rich Results Test and getting zero errors for both schema types.

---

### Phase 2 — Important (correctness & integrity)

#### [x] S4. Login and signup h1 tags say "Trade Analysis" instead of "Trade Analyst"
- **Where:** `app/(auth)/login/page.tsx:44` — `<h1>Trade Analysis</h1>`, `app/(auth)/signup/page.tsx:320` — `<h1>Trade Analysis</h1>`
- **Issue:** **Confirmed.** The brand name in the root layout metadata, OG tags, footer, and sitemap is "Trade Analyst", but the login and signup page h1 headings say "Trade Analysis". Search engines use h1 content for relevance signals and entity recognition. Inconsistent naming across pages weakens brand signal consolidation.
- **Acceptance:** All h1 tags across the site use the same brand name that appears in the root layout metadata. Verified by fetching `/login` and `/signup` and confirming the h1 text matches the `<title>` brand name.

#### [x] S5. Landing page demo video has no captions track
- **Where:** `components/landing/landing-video.tsx:56-69` — `<video>` element has no `<track>` child.
- **Issue:** The product demo video autoplays on the landing page but has no `<track kind="captions">` element. Search engines cannot index video content without text alternatives. Additionally, WCAG 1.2.2 requires captions for prerecorded audio content. While the video has `aria-label`, that describes what the element *is*, not what is shown/said in the video.
- **Acceptance:** The video element includes a `<track>` element with Hebrew captions (or English if the video has no spoken audio — a descriptive track of the UI actions shown). Verified by inspecting the rendered `<video>` element and confirming a `<track>` child is present.

#### [x] S6. OG description inherits the too-short root description
- **Where:** `app/layout.tsx:44` — `description: SITE_TAGLINE` inside the `openGraph` block.
- **Issue:** The Open Graph description is the same 20-character `SITE_TAGLINE` string. When the page is shared on social media (LinkedIn, Twitter, Facebook, WhatsApp), the preview card shows a near-empty description. This reduces click-through from social shares.
- **Acceptance:** The OG description is 60-120 characters and compellingly summarizes the product for social preview cards. Verified by pasting the URL into the Facebook Sharing Debugger or Twitter Card Validator and seeing a meaningful description in the preview.

#### [x] S7. `reset-password` in robots.txt allow list but missing from sitemap
- **Where:** `app/robots.ts:10` allows `/reset-password`, but `app/sitemap.ts` does not include it.
- **Issue:** Minor inconsistency between robots.txt and sitemap. If a page is worth allowing crawlers to access, it is generally worth including in the sitemap so crawlers discover it. Conversely, if the page is transient (only accessed via email links), it should not be in the allow list.
- **Acceptance:** Either `/reset-password` is added to the sitemap with low priority, or it is removed from the robots.txt explicit allow list (the default `allow: /` already permits it unless disallowed). The robots.txt and sitemap are consistent in their treatment of this URL.

---

### Phase 3 — Polish (consistency / hygiene)

#### [x] S8. No dedicated pricing page for organic search
- **Where:** Pricing content lives inline in `components/landing/pricing-section.tsx`, embedded in the landing page.
- **Issue:** **Deferred 2026-07-09** — owner decision. Marketing is TikTok-first, not SEO-first; the inline pricing section on the landing page is sufficient for the current stage. Revisit when organic search becomes a growth channel. The pricing section is not independently addressable — there is no `/pricing` URL in the sitemap. Users searching for "trading journal pricing" or "יומן מסחר מחירים" cannot land on a dedicated pricing page. Competitor sites typically have standalone pricing pages that rank for price-comparison queries.
- **Acceptance:** ~~A `/pricing` page exists in the sitemap, renders the pricing content with a unique title and description, and is reachable via internal navigation. Verified by fetching `/pricing` and confirming a 200 response with appropriate meta tags.~~ Deferred by owner decision — closure by decision, not by implementation.

#### [x] S9. `keywords` meta tag provides negligible SEO value
- **Where:** `app/layout.tsx:37` — `keywords: ['יומן מסחר', 'trading journal', 'AI', 'IBKR', 'אנליטיקה', 'מסחר']`
- **Issue:** Google has publicly stated since 2009 that the `keywords` meta tag carries no weight in ranking. The tag is harmless but creates a false sense of SEO coverage. Effort spent maintaining it is better directed at content and structured data.
- **Acceptance:** The `keywords` field is either removed from the metadata export or left as-is with no further maintenance effort. **Closed 2026-07-09** — kept as-is per the "no further maintenance" clause of Acceptance. No behavioural change needed.

#### [x] S10. No content pages exist for organic discovery
- **Where:** Site-wide — the sitemap contains only functional pages (home, auth, legal). No blog, guides, or educational content.
- **Issue:** **Deferred 2026-07-09** — owner decision. No blog planned; marketing focus is TikTok (not indexable by search engines). Feature-specific landing pages (e.g., `/ibkr-sync`, `/fifo-analytics`) were noted as a lower-effort alternative but deferred to a future round. The site has zero content pages targeting informational search queries. Competitors in the trading journal space publish guides about journaling best practices, FIFO accounting, trading psychology, and broker integration tutorials. Without content, the site relies entirely on branded search and direct traffic for organic discovery.
- **Acceptance:** ~~At least one content section (e.g., `/blog` or `/guides`) exists with indexable pages that target non-branded informational queries relevant to the product's audience. Verified by checking the sitemap for content URLs and confirming they render with appropriate meta tags and heading structure.~~ Deferred by owner decision — closure by decision, not by implementation.

#### [x] S11. Footer internal linking is minimal
- **Where:** `components/public-footer.tsx:8-21` — only links to `/terms`, `/privacy`, and `mailto:`.
- **Issue:** The footer appears on every public page and is a valuable site-wide internal linking surface. It currently links only to legal pages. Adding links to key conversion pages (signup, login) and any future content sections would distribute link equity and provide crawlers with consistent navigation signals.
- **Acceptance:** The footer includes links to at least the homepage, signup, and any content section that exists at the time of implementation. Verified by inspecting the footer HTML and confirming the links are present and functional.

---

## Open Questions / Items Requiring Owner Input

- ~~**Is `/reset-password` intentionally in the robots.txt allow list?**~~ **Resolved:** Owner confirmed it is email-only. Remove from allow list (covered by S7).
- ~~**Is a blog or content section planned?**~~ **Resolved:** No blog planned. Owner is considering TikTok as a marketing channel (not indexable by search engines). Feature-specific landing pages (e.g., `/ibkr-sync`, `/fifo-analytics`) are a lower-effort alternative to a blog for organic discovery — deferred to a future round. S10 remains open but deprioritized.
- ~~**Should the OG image vary per page?**~~ **Resolved:** No blog or content expansion planned, so a single OG image is sufficient. Revisit if feature landing pages are added.
- ~~**Video captions: is the demo video narrated or silent?**~~ **Resolved:** Silent with some existing on-screen captions. S5 remains valid (a `<track>` element is still needed for accessibility/SEO) but is lower priority than it would be for narrated content.

---

## Discovered During Remediation

> Add new findings here as they surface while working through the plan. Same format: `[ ] S##. Title` + Where / Issue / Acceptance.

#### [x] S12. Stale "Trade Analysis" brand name in signup verification instructions
- **Where:** `app/(auth)/signup/page.tsx:415` — `<li>מצא מייל מ-Trade Analysis עם קישור אימות</li>`
- **Issue:** **Confirmed.** Surfaced while verifying S4. The h1 tags on login/signup were fixed to "Trade Analyst", but a leftover reference to "Trade Analysis" remains in the email verification instructions list. Not indexable content (behind a form interaction), so the SEO impact is negligible, but it perpetuates the same brand-consistency issue S4 was meant to eliminate. Additional stale occurrences found and fixed during remediation: `components/header.tsx:79` (dashboard header, user-visible), `components/trade-logo.tsx:14` (logo alt text, SEO-indexable), and `README.md:1` (repo landing on GitHub).
- **Acceptance:** All user-visible occurrences of "Trade Analysis" across the codebase are updated to "Trade Analyst". Verified by grepping the codebase for `Trade Analysis` and confirming no user-visible matches remain (comments and identifiers are out of scope).
