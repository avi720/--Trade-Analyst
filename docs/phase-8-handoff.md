# Phase 8 Handoff — Trade Search + Soft Field Editing + Manual Entry / Excel Import

## Summary
Phase 8 is complete — **189/189 tests pass** (34 new), **build clean**.

Three major features shipped:
1. **Full search tab** — filterable, sortable, paginated trade results (client-side filtering, 25/page)
2. **Trade detail modal** — click-to-edit soft fields (notes, setup, emotional state, stop/target prices, didRight, wouldChange)
3. **Manual import tab** — two sub-tabs for entering trades manually or importing from Excel

## What Was Built

### Feature 1: Search Tab (`/search`)
- **Server**: `app/(dashboard)/search/page.tsx` — loads all trades (no pagination server-side)
- **Client**: `components/trade-search.tsx` — React filters, sorts, paginates in memory; URL sync for shareability
- Filters: ticker/notes (free-text), date range, direction, result, setupType, R range, status (All/Closed/Open)
- Columns: ticker, direction, setupType, openedAt, closedAt, actualR, realizedPnl, totalCommission, result
- Click row → opens trade detail modal

### Feature 2: Trade Detail Modal (`components/trade-detail-modal.tsx`)
- Modal overlay with read-only trade summary (9 fields)
- Sub-table: all Orders for the trade (fetched client-side via Supabase browser client on open)
- Editable form: 8 soft fields (notes, setupType, emotionalState, executionQuality, stopPrice, targetPrice, didRight, wouldChange)
- PATCH `/api/trades/[id]` with whitelist validation (anon key, RLS enforced)

### Feature 3: Manual Entry / Excel Import (`/manual-import`)
**Manual Entry Sub-tab**:
- Form with repeatable rows: ticker, date, time, side (BUY/SELL), quantity, price, commission, currency
- Converts to `NormalizedExecution[]`, sends to `POST /api/trades/manual`
- Uses existing `processExecutions()` pipeline for FIFO + DB writes
- Synthetic `brokerExecId: MANUAL-{ticker}-{timestamp}-{index}` prevents collisions

**Excel Import Sub-tab**:
- Template download (blank xlsx with example row)
- Drag-drop or click-to-upload
- Client-side preview (parse via `lib/trade/excel-import.ts`)
- Confirm → same pipeline as manual entry
- Template columns: date, time, ticker, side, quantity, price, commission, currency
- Supports Hebrew column aliases (תאריך, שעה, טיקר, וכו')

### New Lib Utilities
- `lib/trade/manual-entry.ts` — `validateLeg()`, `buildExecution()`, `buildExecutions()`
- `lib/trade/excel-import.ts` — `parseExcelBuffer()` (SheetJS), `generateTemplate()`

### API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/trades/[id]` | PATCH | Update soft fields (whitelist: notes, setupType, emotionalState, executionQuality, stopPrice, targetPrice, didRight, wouldChange) |
| `/api/trades/manual` | POST | JSON body `{ legs: ManualLeg[] }` → processExecutions |
| `/api/trades/import` | GET | `?template=true` → download blank Excel template |
| `/api/trades/import` | POST | `multipart/form-data` file upload → preview + confirm → processExecutions |

### Header Nav Update
Added `{ label: 'ייבוא-ידני', href: '/manual-import' }` to TABS array.

### Tests
- **20 tests** in `__tests__/manual-entry.test.ts` — validates all fields, synthetic ID format, batch processing
- **14 tests** in `__tests__/excel-import.test.ts` — parsing (valid rows, skipped rows, missing columns, Hebrew aliases), template generation
- All existing 155 tests still pass

## External Services
No new external services. Uses existing:
- **Supabase Auth** (RLS enforced on Trade/Order tables)
- **SheetJS (xlsx)** — already in package.json, pure JS (ARM64-safe)

## Test Status
**189/189 pass** (155 baseline + 34 new)

```
 ✓ __tests__/manual-entry.test.ts (20 tests)
 ✓ __tests__/excel-import.test.ts (14 tests)
 ✓ All existing tests still pass
```

Build: **Clean** (Next.js 14, no TypeScript errors)

## Key Architectural Decisions

### 1. Client-Side Filtering (Not Supabase)
Rationale: Single-user app with <1000 trades. Loading all trades once and filtering in JS gives instant, reactive UI without server round-trips per filter change. URL holds state for shareability/back-navigation but doesn't trigger fetches.

### 2. Soft Field Modal (Not Separate Page)
Rationale: Inline edit modal is faster UX than navigating to a separate page. Data fetches orders client-side via browser Supabase client (RLS-safe).

### 3. Reuse `processExecutions()` Pipeline
Manual/Excel entries converted to `NormalizedExecution[]` and fed through the existing FIFO pipeline (dup check, STK validation, FIFO matching, REVERSAL handling, atomic RPC for reversals). No separate code path.

### 4. Synthetic brokerExecId for Manual Entries
Format: `MANUAL-{TICKER}-{UTC_TIMESTAMP}-{INDEX}`. Ensures:
- No collision with IBKR exec IDs (which use broker-assigned values)
- Deterministic for testing
- Unique within a session (timestamp + index)
- Human-readable for debugging

### 5. Excel Template Download (GET endpoint)
Users can generate and download a blank template from the app (`/api/trades/import?template=true`), eliminating external file hosting or docs. Template is auto-generated by SheetJS on each request.

## Data Flow
```
Manual Entry Form → NormalizedExecution[] → processExecutions → FIFO + DB writes
    or
Excel File Upload → parseExcelBuffer → NormalizedExecution[] → (same)
```

## Known Limitations / Future Work
1. **Excel format**: Currently supports columns in any order (aliased), but does not support multiple sheets (always reads first sheet)
2. **Manual entry**: No CSV export yet (can be Phase 9)
3. **Search UX**: No multi-select filters (e.g., "AAPL OR MSFT"); filters are AND-ed currently
4. **Soft field editing**: Limited to modal; no inline editing in the search table
5. **Duplicate prevention**: Relies on brokerExecId unique constraint; manual-entry MANUAL-IDs will prevent re-import of same manual entry

## Next Phase Notes

### Phase 9 Candidates
1. **Trade detail page** — `/trade/[id]` with full layout, all fields editable, Order sub-table, possibly P&L chart
2. **CSV export** — search results or specific trade
3. **Advanced search** — tag-based filtering, custom columns, saved filters
4. **Mobile optimization** — search table may be cramped on mobile
5. **Performance** — index trades by ticker for faster search; pagination on the server if >1000 trades

## Checklist
- [x] All tests pass (189/189)
- [x] Build clean (no TypeScript errors)
- [x] Routes wired to nav header
- [x] RLS enforced (uses anon client, not admin)
- [x] Soft field whitelist enforced (PATCH route)
- [x] Template download working
- [x] Excel parsing (SheetJS) verified
- [x] Manual entry form (client) verified
- [x] FIFO pipeline reused (no new DB logic)
- [x] End-of-phase handoff (this document)
- [x] CLAUDE.md updated with Phase 8 section
