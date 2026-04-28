# Phase 7 — AI Chat "חנן" — Handoff

**Date**: 2026-04-29  
**Test status**: 155/155 pass ✅  
**Build**: clean ✅

---

## What Was Built

Phase 7 wires up a real-time Hebrew AI trading mentor ("חנן") into the dashboard via a slide-in sidebar. The previous Phase 5 stub is fully replaced.

### New files

| File | Purpose |
|------|---------|
| `lib/chat/chat-context.tsx` | React Context (`ChatContextProvider` + `useChatContext`) — shares `isOpen`, `toggleChat`, `contextData`, `setContextData` across the layout tree |
| `lib/chat/gemini-client.ts` | `callGemini()` — server-side Google Generative AI wrapper with 5-attempt exponential backoff (1s→2s→4s→8s→16s). Retries on 429 and 5xx; immediate throw on 4xx. Injectable `delayFn` for testability. |
| `app/api/chat/route.ts` | POST `/api/chat` — authenticated (RLS via `createClient()`). Two context modes: "חכם" fetches contextData from client, "עומק" fetches full closed-Trade history from DB. Upserts `AIConversation` with full message history. |
| `__tests__/chat/gemini-client.test.ts` | 7 unit tests: success, 429 retry, retry exhaustion, 400 no-retry, model selection, 5xx retry, history passing. Uses `vi.mock` + `noDelay` injected. |

### Modified files

| File | Change |
|------|--------|
| `components/chat-sidebar.tsx` | Full replacement of Phase 5 stub → live chat UI with conversation persistence, context mode toggle, auto-scroll, loading state, error display |
| `components/header.tsx` | Added "חנן ▶" toggle button (amber, font-mono) wired to `useChatContext().toggleChat` |
| `app/(dashboard)/layout.tsx` | Wrapped with `ChatContextProvider`; `<ChatSidebar />` rendered **outside** the `overflow-hidden` flex container (sibling of the main div) to ensure `position: fixed` works across all browsers |
| `components/research-dashboard.tsx` | Removed local chatOpen state + ChatSidebar; added `setContextData` effect with stats + filtered trades |
| `components/open-positions-dashboard.tsx` | Removed local chatOpen state + ChatSidebar; added `setContextData` effect with unrealized PnL per position |

---

## External Services

| Service | Status | Notes |
|---------|--------|-------|
| Google Gemini API | Requires `GEMINI_API_KEY` env var | Free tier available; "חכם" uses `gemini-2.0-flash`, "עומק" uses `gemini-2.0-pro` |
| Supabase `AIConversation` table | Pre-existing (Phase 7 DB migration was applied earlier) | RLS policy `ai_conversations_own` already active; `messages: Json` column |

**New env var**: `GEMINI_API_KEY` — must be set in Render env + `.env.local`.

---

## DB

No new migration in Phase 7. The `AIConversation` table (with `id`, `userId`, `contextType`, `messages: Json`, `updatedAt`) was created via an earlier migration. RLS policy `ai_conversations_own` allows `auth.uid() = "userId"`.

---

## Key Architectural Decisions

### React Context over props
Next.js 14 App Router Server Components cannot receive props from their children. `ChatContextProvider` is a `'use client'` component that wraps the dashboard layout, allowing any page component to call `setContextData()` to push context into the AI sidebar.

### Server-side Gemini call
The Gemini API key never leaves the server. `POST /api/chat` uses the authenticated Supabase client (not service-role) — RLS ensures each user can only access their own conversations and trades.

### Two context modes
- **חכם (Flash)** — client pushes summarized context (open positions or research stats) in the request body. Fast, cheap, suited for on-screen questions.
- **עומק (Pro)** — server fetches full closed-Trade history from DB. Slower, more expensive, for deep pattern analysis across all trades.

### Sidebar layout fix
`<ChatSidebar />` must be rendered **outside** any `overflow-hidden` ancestor to ensure `position: fixed` anchors to the viewport. The layout places it as a sibling of the main `flex flex-col h-screen overflow-hidden` div, directly inside `ChatContextProvider`.

### Conversation persistence
`localStorage` stores `chat_conversation_id`. On mount the sidebar fetches the conversation from Supabase `AIConversation`. The `messages` array is the full history passed to Gemini as `history: ChatMessage[]` on each turn.

---

## IBKR Flex Parser Bug Fix (also in this session)

**Root cause**: `normalizeNode()` in `parse-flex-xml.ts` was written with PascalCase field names matching Trade Confirm XML (`ExecID`, `Symbol`, `Buy/Sell`, etc.) but real IBKR Activity reports use camelCase (`ibExecID`, `symbol`, `buySell`, `tradePrice`, etc.) AND wrap everything in a `FlexQueryResponse` root element.

**Fix**:
1. Added `resolveStatement()` helper that handles both `FlexQueryResponse → FlexStatements → FlexStatement` and `FlexStatements → FlexStatement` root paths.
2. Updated every field in `normalizeNode()` to use `??` fallback: `node["ExecID"] ?? node["ibExecID"]`, `node["Symbol"] ?? node["symbol"]`, etc.
3. Added 4 new test cases in `__tests__/flex-xml.test.ts` covering the real IBKR Activity XML format.

Test count went from 151 → 155 (4 new XML tests). All 155 pass.

---

## Test Results

```
Test Files  10 passed (10)
      Tests  155 passed (155)
   Duration  ~7s
```

| Suite | Count |
|-------|-------|
| fifo.test.ts | 22 |
| calculations.test.ts | 17 |
| parse-date.test.ts | 20 |
| position-calc.test.ts | 24 |
| research-charts.test.ts | 23 |
| flex-xml.test.ts | 22 (was 18) |
| process-executions.test.ts | 8 |
| chat/gemini-client.test.ts | 7 (new) |
| fifo-to-db.test.ts (integration) | 2 |
| **Total** | **155** |

---

## Phase 8 Overview — Trade Search

**Goal**: Full-text + filter search across all trades (open + closed). The `search/` route under `app/(dashboard)/` already has a placeholder.

Likely features:
- Server-side search with Supabase `.ilike()` / full-text on ticker, setupType, notes
- Filters: date range, direction, result, setup, R range
- Results table with key metrics per trade
- Click-through to trade detail (Phase 9?)
- Possibly a "Trade Detail" page/modal showing all orders in a trade

No new external services expected. No new DB migrations needed (Trade + Order tables are already indexed by `userId`).
