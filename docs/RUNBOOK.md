# Operations Runbook — Trade Analyst

Operational procedures for incidents and routine maintenance. Each runbook is self-contained: read it, follow the steps, you're done. Last updated: 2026-06-28.

For background on the architecture, read [`CLAUDE.md`](../CLAUDE.md). For security context, read [`docs/SECURITY-AUDIT.md`](SECURITY-AUDIT.md).

---

## 1. Rotate `FLEX_TOKEN_ENCRYPTION_KEY`

**When:** suspected key compromise, scheduled annual rotation, or post-incident hardening.

**Blast radius:** every IBKR Flex token in `BrokerConnection.flexTokenEncrypted` is encrypted under the current key. Rotation requires decrypting with the old key and re-encrypting with the new one — atomic at the row level, not at the table level.

**Steps:**
1. Generate a new 32-byte hex key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. In Vercel → Settings → Environment Variables, set `FLEX_TOKEN_ENCRYPTION_KEY_NEW` to the new value (Production only). Do **not** overwrite the current `FLEX_TOKEN_ENCRYPTION_KEY` yet.
3. Write a one-off migration script under `scripts/rotate-flex-key.ts` that loops over `BrokerConnection`, decrypts with `process.env.FLEX_TOKEN_ENCRYPTION_KEY`, re-encrypts with `process.env.FLEX_TOKEN_ENCRYPTION_KEY_NEW`, updates the row.
4. Run locally against production via `npx tsx scripts/rotate-flex-key.ts` with both env vars set from a `.env.rotate` file. The `v1:` format prefix in `lib/ibkr/encrypt.ts` lets you verify each row was re-encrypted.
5. In Vercel, set `FLEX_TOKEN_ENCRYPTION_KEY` to the new value, remove `FLEX_TOKEN_ENCRYPTION_KEY_NEW`, redeploy.
6. Verify: manually trigger IBKR sync for one user (runbook 2) and confirm the Flex Web Service call succeeds with the re-encrypted token.

**Rollback:** if step 4 fails partway, the rows that were already re-encrypted will fail to decrypt with the OLD key. The script must either complete or be re-runnable with retry logic. Re-running with both env vars set is safe — the script can be made idempotent by checking the `v1:` ciphertext format against a marker (e.g., a temporary `keyVersion` column).

---

## 2. Manually trigger IBKR sync for one user

**When:** user reports missing trades, support ticket asks for resync, or post-incident replay.

**Steps:**
1. Get the user's `userId` from Supabase Dashboard → Authentication → Users.
2. Locally, with production credentials in `.env.local`:
   ```bash
   npx tsx scripts/sync-one-user.ts <userId>
   ```
   (Script does not exist yet — create as a one-off if needed; pattern is in `app/api/cron/ibkr-sync/route.ts`.)
3. Alternative: temporarily POST to `https://tradeanalyst.app/api/cron/ibkr-sync` with `Authorization: Bearer $CRON_SECRET`, but this iterates over ALL users. Only use for full-system replay.
4. Verify in Supabase → Table editor → `BrokerEvent`: the latest row for that user has `status='success'` and a recent `createdAt`.
5. Open `/research` as the user (admin impersonation in Supabase Dashboard → Auth → Users → impersonate) and confirm the new trades appear.

---

## 3. Revoke a user's auth session

**When:** account compromise reported, credential leak, abuse pattern detected.

**Steps:**
1. Supabase Dashboard → Authentication → Users → search by email.
2. Click the user → "Sign out" button. This invalidates all active refresh tokens for that user.
3. If suspected password breach: also click "Reset password" — sends a reset email. Document the action in an internal note.
4. If the user reported a stolen Flex token: in Supabase → Table editor → `BrokerConnection`, delete the row for that `userId`. They will need to reconnect IBKR with a fresh token.

---

## 4. Full GDPR Article 17 deletion (right to be forgotten)

**When:** user submits a deletion request via email or in-app, and the in-app `/profile?tab=account` → "מחיקת חשבון" flow is not sufficient (e.g., user is locked out).

**Steps:**
1. Verify the requester is the account owner (reply from the registered email; do not act on requests via third-party channels).
2. In Supabase Dashboard → Authentication → Users → delete the user. This cascades via FKs and removes: `Trade`, `Order`, `BrokerConnection`, `AIConversation`, `AuditEvent`, `RateLimit` rows for that `userId`.
3. Manually verify by running these SQL queries in Supabase → SQL Editor:
   ```sql
   SELECT count(*) FROM "Trade" WHERE "userId" = '<deleted-uuid>';
   SELECT count(*) FROM "Order" WHERE "userId" = '<deleted-uuid>';
   SELECT count(*) FROM "BrokerConnection" WHERE "userId" = '<deleted-uuid>';
   SELECT count(*) FROM "AuditEvent" WHERE "userId" = '<deleted-uuid>';
   ```
   All four should return `0`. If not, manually delete the orphaned rows.
4. **Audit logs retention:** any `AuditEvent` row referencing the deleted user is also removed (FK cascade). If retention beyond deletion is ever required for legal reasons, this needs a schema change first.
5. **Lemon Squeezy:** subscriptions are NOT cancelled by the Supabase delete. Manually cancel the user's subscription in Lemon Squeezy dashboard, or have the user do it before the deletion request.
6. **Supabase backups:** point-in-time recovery may retain the user's data for up to the backup window (default 7 days on Pro plan). Per the Privacy Policy this is acceptable; do not attempt to scrub backups.
7. Reply to the user confirming deletion. Save the email thread for compliance records (separate from the app DB).

---

## 5. Restore from Supabase point-in-time recovery (PITR)

**When:** accidental table drop, bad migration, suspected DB corruption.

**Steps:**
1. Supabase Dashboard → Database → Backups → Point in Time Recovery.
2. Select the target timestamp. PITR resolution is 1 second on Pro plan.
3. **Critical: PITR creates a new project — it does not restore in place.** Choose to restore to a NEW Supabase project. Take note of the new project's URL and anon/service-role keys.
4. Pause writes to production: deploy a quick "maintenance mode" 503 page via Vercel rollback, OR add a feature flag that returns 503 from all API routes.
5. Update Vercel env vars to point at the new Supabase project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`.
6. Redeploy and verify a few user accounts manually before resuming public traffic.
7. After confirmation: pause the old Supabase project (`pause_project`) to avoid double-billing.

**Drill required:** this runbook must be exercised at least once against a staging Supabase project before being trusted in an incident. See L19 in [`docs/LAUNCH-READINESS.md`](LAUNCH-READINESS.md).

---

## 6. Roll back a bad Vercel deploy

**When:** post-deploy regression — error rate spike in Sentry, user reports broken page, build broke a feature in unexpected ways.

**Steps:**
1. Vercel Dashboard → Deployments → find the previous READY deployment that was healthy.
2. Click the `...` menu → "Promote to Production". Takes ~10 seconds.
3. Verify production at https://tradeanalyst.app loads and the broken feature works again.
4. In git, identify the bad commit: `git log --oneline main`. Don't `git revert` yet — investigate first.
5. Open Sentry dashboard, filter by Release = bad-commit-sha, read the top errors.
6. Either: (a) `git revert <bad-sha>` and push → triggers a new deploy of the reverted state; or (b) cherry-pick a fix forward and push.
7. Promote the new fix-forward or revert deploy to Production once it's READY.

**Don't:** force-push to main, or `git reset --hard` to wipe history. Vercel needs commit history continuity for rollback parity.

---

## 7. Lemon Squeezy webhook desynchronized from `subscriptionTier`

**When:** user reports paying but still seeing Free-tier limits, or reverse — Free user has Pro access.

**Steps:**
1. Open Lemon Squeezy Dashboard → Customers → find the user by email. Note `subscription_id`, `status`, `renews_at`.
2. In Supabase Dashboard → Table editor → `User` → search by email. Compare `lemonsqueezySubscriptionId`, `subscriptionStatus`, `subscriptionRenewsAt`.
3. If they're out of sync, the webhook either failed to fire or failed signature verification. Check Sentry for `[billing/webhook]` errors.
4. **Quick fix:** in Supabase → SQL Editor:
   ```sql
   UPDATE "User"
   SET "subscriptionTier" = 'Pro',
       "subscriptionStatus" = 'active',
       "subscriptionRenewsAt" = '<renews_at from LS>',
       "lemonsqueezySubscriptionId" = '<sub_id from LS>'
   WHERE email = '<user-email>';
   ```
5. **Long fix:** in Lemon Squeezy → Settings → Webhooks → find the failed webhook delivery → click "Resend". The receiver is idempotent (the webhook upserts).
6. Add an `AuditEvent` row noting the manual override:
   ```sql
   INSERT INTO "AuditEvent" ("userId", "eventType", "status", "metadata", "createdAt")
   VALUES ('<user-uuid>', 'subscription_manual_sync', 'success',
           '{"reason": "webhook desync", "operator": "<your-name>"}'::jsonb, NOW());
   ```

---

## Contact + escalation

- **Owner / sole operator:** Aviur Paz · support@tradeanalyst.app
- **Supabase support:** dashboard chat (Pro plan)
- **Vercel support:** dashboard chat (Pro plan)
- **Lemon Squeezy support:** support@lemonsqueezy.com
- **IBKR Flex issues:** verify via the customer-portal Flex Web Service section first; vendor support is slow (~48h).
