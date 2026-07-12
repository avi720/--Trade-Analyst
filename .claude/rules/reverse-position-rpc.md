# `reverse_position` RPC — signature & guard rules

## Always use the 11-param `p_`-prefixed overload

```
reverse_position(
  p_close_trade_id,
  p_close_status,
  p_close_at,
  p_avg_exit_price,
  p_actual_r,
  p_result,
  p_realized_pnl,
  p_total_commission,
  p_close_order,      -- jsonb
  p_new_trade,        -- jsonb
  p_new_order         -- jsonb
)
```

Atomic FIFO REVERSAL: closes the existing position **and** opens the opposite-side trade in one Postgres transaction.

An older **5-param overload** exists in the database from an earlier attempt. Do not call it. If you see it being called anywhere, that's a bug.

## The close UPDATE is guarded — do not add a guard param

The close UPDATE inside the function only fires when the trade is **still `status='Open'`** AND its `totalQuantity` still equals `p_close_order.quantity` (the open size the caller matched against). On mismatch it raises `reverse_position_conflict`.

`process-executions.ts` catches that as a retryable `ConflictError` (see [fifo-concurrency.md](fifo-concurrency.md)).

**Do not change the 11-param signature to add a separate `p_expected_qty` guard param** — the guard already reuses the existing `p_close_order.quantity`. Adding a new param would break every current caller for no benefit.
