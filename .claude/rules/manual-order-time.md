# `_manualOrderTime` — do not remove

Applies to [lib/trade/manual-entry.ts](../../lib/trade/manual-entry.ts) and [lib/ibkr/process-executions.ts](../../lib/ibkr/process-executions.ts).

## The pattern

Manual entries pre-parse `orderPlacedDate` + `orderPlacedTime` into an ISO string and store it as `rawPayload._manualOrderTime` inside `buildExecution()`.

`buildOrderInsert()` in `process-executions.ts` detects that key and uses it directly to populate `Order.orderTime`, **bypassing the IBKR date parser** — because manual entries never go through IBKR and don't have the `dd/MM/yyyy;HH:mm:ss TZ` format that [ibkr-date-parsing.md](ibkr-date-parsing.md) expects.

## The rules

- **Do not remove `_manualOrderTime` from `rawPayload`.** The two ends of this contract live in different files, so a change on one side without the other silently drops manual `orderTime` values.
- **Do not rename it without a coordinated change** to both `buildExecution()` (writer) and `buildOrderInsert()` (reader).
- **Do not try to unify manual + IBKR paths** by routing manual entries through `parseIbkrDate()`. Manual entries are already ISO — running them through the IBKR-format parser will just fail and drop the value.

## Related order-level defaults for manual entries

`buildExecution()` also stores:
- `rawPayload.ibCommissionCurrency` — always set, falls back to the leg's `currency` when the user didn't provide a separate `commissionCurrency`.
- `rawPayload.broker` — informational only, stored when the user picked a broker.

Keep these when refactoring `rawPayload` shape — they're read further downstream by `buildOrderInsert()` and by the CSV export.
