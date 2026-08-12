#!/usr/bin/env bash
# Fires around a Supabase MCP apply_migration call (see .claude/settings.json).
#
# Purpose: the db-schema skill is matched semantically, so it can be missed if a
# request is phrased unusually. This hook is deterministic — it fires on the tool
# call itself, so the checklist is in context regardless of phrasing.
#
# Usage: db-migration-notice.sh pre|post   (hook payload arrives on stdin, unused)
set -euo pipefail

cat >/dev/null # drain stdin so the caller never sees a broken pipe

case "${1:-pre}" in
pre)
  event="PreToolUse"
  short="db-schema checklist injected before migration"
  body="db-schema checklist (full detail: .claude/skills/db-schema/SKILL.md):

1. New table? Ship RLS enabled + an auth.uid() = \"userId\" policy in THIS migration,
   not a follow-up.
2. Admin-wide read? Use the SECURITY DEFINER public.is_admin(uuid) helper. Never an
   inline EXISTS(SELECT ... FROM \"User\") — that causes infinite policy recursion.
3. Prefer IF NOT EXISTS / IF EXISTS so the migration is idempotent-safe.
4. Do NOT re-add Order columns dropped in cleanup: tax, tradeDate, exchange,
   proceeds, brokerTradeId, rawPayload. The audit trail lives on
   BrokerEvent.rawPayload. Order.broker IS a real column and must stay one.
5. User billing columns are RLS-protected against authenticated-role writes
   (migration harden_user_billing_write_paths) — write them only via
   createAdminClient().

If any of the above is unclear for this change, load the db-schema skill before
continuing."
  ;;
post)
  event="PostToolUse"
  short="db-schema: regenerate lib/db/types.ts"
  body="Migration applied. The generated types are now stale — regenerate them, or the
build will fail on columns TypeScript doesn't know about:

1. Call the Supabase MCP generate_typescript_types tool for project id
   nwvswntqrqqtwzrhzpmi.
2. Overwrite lib/db/types.ts with the output. Never hand-edit that file.
3. Run: npm run build   (the TypeScript gate is the backstop for this step)"
  ;;
*)
  echo "usage: ${0##*/} pre|post" >&2
  exit 1
  ;;
esac

# Emitted via node, not jq: jq is not installed on this machine, and node is
# guaranteed present because this is a Node project. Strings go through the
# environment so no quoting reaches a shell parser.
HOOK_EVENT="$event" HOOK_SHORT="$short" HOOK_BODY="$body" node -e '
process.stdout.write(JSON.stringify({
  systemMessage: process.env.HOOK_SHORT,
  hookSpecificOutput: {
    hookEventName: process.env.HOOK_EVENT,
    additionalContext: process.env.HOOK_BODY,
  },
}));'
