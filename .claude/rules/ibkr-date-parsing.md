# IBKR date parsing — do not use `new Date()` or `date-fns parse()`

Applies whenever touching [lib/ibkr/parse-date.ts](../../lib/ibkr/parse-date.ts) or any IBKR Flex ingestion path.

## The format

IBKR Flex emits `dd/MM/yyyy;HH:mm:ss TimeZone`, e.g. `23/04/2026;14:30:00 EST`.

## Why the naive approaches are broken

- `new Date("23/04/2026;14:30:00 EST")` — returns `Invalid Date`. The runtime can't parse this shape.
- `date-fns parse()` — parses the components but builds a **local-timezone** `Date` from them. On a server in a non-EST timezone the resulting instant is wrong by hours.

## The correct approach

Manual component parsing + `Date.UTC()`, which is timezone-agnostic:

1. Split on `;` and last space to isolate `datePart`, `timePart`, `tzAbbrev`.
2. Look up the timezone offset in the `TZ_OFFSETS_MINUTES` table (supports EST/EDT/CST/CDT/PST/PDT/UTC).
3. Parse components with `parseInt(..., 10)` and range-validate each.
4. `Date.UTC(y, m-1, d, h, mm, ss)` gives you "wall-clock as if UTC". Subtract `offsetMinutes * 60_000` to convert wall-clock-in-TZ → true UTC.

Regression coverage: [__tests__/parse-date.test.ts](../../__tests__/parse-date.test.ts) covers all US zones + DST transitions. Extend it before adding a new timezone abbreviation to the offset table.

## Flex parser quirk

The Flex XML parser has a dual-root quirk: real Activity XML uses **camelCase** fields (`ibExecID`, `tradePrice`, …) wrapped in `FlexQueryResponse`, while older fixtures use **PascalCase**. [lib/ibkr/parse-flex-xml.ts](../../lib/ibkr/parse-flex-xml.ts) resolves both via `resolveStatement()` and falls back `PascalCase ?? camelCase` per field.

When adding a new IBKR field, follow the same fallback pattern so both real payloads and legacy test fixtures keep parsing.
