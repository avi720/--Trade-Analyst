# FIFO concurrency — retry & guard invariants

Applies to [lib/ibkr/process-executions.ts](../../lib/ibkr/process-executions.ts) and any new code path that persists FIFO actions.

## Why this exists

The FIFO **read → match → write** in `processExecutions` is not atomic. Two overlapping requests for the same `(userId, ticker)` — e.g. request pile-up on Render cold-start / swap — can race. Without safeguards this produces the "orphaned Open rows" QA symptom.

Across **different** users there is never contention (separate rows + RLS).

## Two self-correcting safeguards — do not remove either

### 1. Partial unique index (DB-side)

```
Trade_userId_ticker_open_unique
  ON ("userId", ticker) WHERE status='Open'
```

Enforces the "≤1 open trade per user+ticker" invariant that the FIFO read (`.eq('status','Open').maybeSingle()`) already assumes. A duplicate concurrent OPEN fails with Postgres error `23505` instead of corrupting data.

### 2. Optimistic-concurrency retry (application-side)

In `process-executions.ts`:

- **OPEN** — catches Postgres `23505` and treats it as a `ConflictError`.
- **SCALE_IN / REDUCE / CLOSE** — every UPDATE adds `.eq('status','Open').eq('totalQuantity', <valueReadFromOpenTrade>).select('id')` and treats a **0-row result** as a `ConflictError`.
- **REVERSAL** — the RPC raises `reverse_position_conflict` when the trade moved under it; the caller catches it as `ConflictError`. See [reverse-position-rpc.md](reverse-position-rpc.md).

On `ConflictError` the per-execution loop re-reads the latest open trade and re-runs `matchExecution` (up to `MAX_PERSIST_ATTEMPTS = 4` with small backoff). A racing OPEN becomes a SCALE_IN on the next pass, etc.

## Rules

- **Never bypass the guard on SCALE_IN / REDUCE / CLOSE UPDATEs.** Every mutating path must key on both `status='Open'` AND the `totalQuantity` value that the FIFO read observed.
- **Never treat a non-conflict DB error as retryable.** Only `ConflictError` retries. Genuine errors surface immediately.
- **Never raise `MAX_PERSIST_ATTEMPTS` without evidence.** If four rounds are not enough, the pile-up is real and needs an upstream fix (rate limit / lock), not a longer retry loop.
