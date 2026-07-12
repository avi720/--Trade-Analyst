# RTL + language conventions

- **Root layout**: `<html dir="rtl" lang="he">`. Do not change this per-page.
- **User-facing copy** (labels, buttons, toasts, error messages shown to the user, form placeholders, empty states, marketing/landing copy): **Hebrew**.
- **Code, identifiers, comments, commit messages, log lines, dev-only error strings**: **English**.

## Practical rules

- New UI components should assume RTL by default. When picking Tailwind directional utilities, prefer logical ones (`ms-*` / `me-*` / `ps-*` / `pe-*`) over left/right ones so a stray LTR mount doesn't break.
- Numbers, tickers, and timestamps stay LTR-flowing inside RTL context — use IBM Plex Mono for those (see the Theme section of CLAUDE.md).
- If you're adding a new dev-facing error thrown from server code, write it in English so it's greppable and lands well in Sentry.
