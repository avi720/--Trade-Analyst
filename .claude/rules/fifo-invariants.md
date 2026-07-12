# FIFO logic — invariants

Applies whenever touching [lib/trade/fifo.ts](../../lib/trade/fifo.ts) or the persistence layer that consumes its output.

## Contract

- `matchExecution(exec, openTrade)` returns a `FifoAction` discriminated union: `OPEN | SCALE_IN | REDUCE | CLOSE | REVERSAL`.
- The function is **pure** — no DB calls, no side effects. The caller (`processExecutions`) is responsible for persistence.

## Arithmetic

- All arithmetic uses plain `number`. Postgres NUMERIC columns come back from Supabase as `number` — no `Decimal` / `bignumber.js` involved.
- Don't introduce string-based arithmetic or a decimal library without a real precision failure case; the trading domain here doesn't need it.

## Atomicity — REVERSAL

A REVERSAL closes the existing position and opens the opposite-side trade in the same event. The action carries **two DB writes**. Callers MUST persist them via `supabase.rpc('reverse_position', { ... })` so they happen in one Postgres transaction. Never emulate REVERSAL as two separate client-side writes. See [reverse-position-rpc.md](reverse-position-rpc.md).

## Analytics invariants

- `rDistribution` uses **left-inclusive bins** `[min, max)`. So `r=0 → "0R–1R"`, `r=2 → ">2R"`. Don't flip the inclusivity when adding new bins.
- `actualR` is `null` when `stopPrice` is null OR `riskPerShare < 0.0001` (or `totalQuantityOpened === 0`). This guard prevents `Infinity` / `NaN` from leaking into aggregates. See `calcActualR` and the constant `MIN_RISK_PER_SHARE`.

## Result classification

`resultFromR(actualR, realizedPnl)` prefers R-based classification when a stop exists, and falls back to money-based classification otherwise, so every closed trade is still classified. Keep both branches — dropping the money fallback would leave stopless trades unclassified.
