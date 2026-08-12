---
paths:
  - "lib/trade/**/*.ts"
  - "lib/ibkr/**/*.ts"
  - "app/api/trades/**/*.ts"
  - "__tests__/**/*.ts"
  - "components/trade-entry-form.tsx"
  - "components/closed-trade-entry-form.tsx"
  - "components/manual-close-modal.tsx"
  - "components/position-change-modal.tsx"
  - "components/manual-import-tabs.tsx"
---

# Position mutation paths — who may change an open position

Every write that changes a position goes through `processExecutions` → `matchExecution`. That is not the rule. The rule is **which entry points are allowed to produce which FIFO actions**.

## The invariant

**Manual entry opens positions. It never changes one that already exists.**

`POST /api/trades/manual` (the "טרייד פתוח" tab) may only produce `OPEN` and — within a single submission — `SCALE_IN` onto a position that same submission opened. Anything else is rejected **all-or-nothing with 422, before any write**:

- any leg acting on a trade that was already `status='Open'` before the request, **including a plain scale-in**
- any leg that reduces, closes, or reverses a position opened earlier in the same batch

Enforced by `findForbiddenLegs` in [guard-position-mutations.ts](../../lib/trade/guard-position-mutations.ts), which replays the batch through the real `matchExecution` rather than re-deriving FIFO semantics. If the FIFO rules change, the guard follows.

## Where each mutation belongs

| Intent | Route | FIFO action |
|---|---|---|
| Open a position | `POST /api/trades/manual` | `OPEN` (+ in-batch `SCALE_IN`) |
| Add money to an open position | `POST /api/trades/[id]/add-to-position` | `SCALE_IN` |
| Sell part of an open position | `POST /api/trades/[id]/reduce-position` | `REDUCE` |
| Close a position | `POST /api/trades/[id]/close` | `CLOSE` |
| Open + close in one go | `POST /api/trades/manual/closed` | `OPEN` then `CLOSE` |

The add/reduce/close routes are gated on `source='manual'` and `status='Open'`. Broker-sourced trades mirror IBKR and must not be hand-edited — the next sync would fight the manual row.

## Exempt from the guard — do not "fix" these

The guard lives **above** `processExecutions`, in the manual-entry route only. These paths deliberately produce closing actions and must keep doing so:

- **`POST /api/trades/import/confirm`** (Excel) and the **AI-import confirm route** — a spreadsheet is one row per execution, so every closed trade has a `SELL` row for its `BUY` row. Routing either through the guarded endpoint silently drops every exit and leaves the trades open forever. This is why the Excel import has its own confirm route instead of reusing `/api/trades/manual`.
- **IBKR sync** (`lib/ibkr/sync-pipeline.ts`) — the broker really does send closing executions.
- **The add / reduce / close routes themselves** — they are what the guard steers users toward.

## Why scale-in is blocked too, not just closes

Because there is now a dedicated modal for it that records *why* the user added money. Allowing the same action from two places would mean half the scale-ins carry that note and half don't, which makes the note worthless as a record.

## Notes appended by these flows

`add-to-position` and `reduce-position` stamp a fixed-prefix line onto `Trade.notes`:

```
בתאריך DD/MM/YYYY הוספתי כסף לפוזיציה כי <reason>
בתאריך DD/MM/YYYY מכרתי חלק מהפוזיציה כי <reason>
```

Composed **server-side** in [position-notes.ts](../../lib/trade/position-notes.ts) — the client sends only the reason and renders the prefix as static text outside the textarea. The fixed wording is what distinguishes these lines from free-form notes; don't let the client supply it, and don't reword it without checking the notes filter in the search tab.

A blank reason writes **nothing** — not even the prefix. The reason is optional, and a dangling "כי" reads as a truncated sentence.
