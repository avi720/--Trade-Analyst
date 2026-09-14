/**
 * Integration test: X14 — orphaned-subscription audit row actually lands.
 * Skipped automatically if SUPABASE_SERVICE_ROLE_KEY is not set.
 *
 * AuditEvent.userId has an FK to User(id). The webhook's orphan branch fires
 * precisely when the LS user_id has no User row, so passing that id as userId
 * made every insert fail with 23503 — and logAuditEvent swallows errors into a
 * console line, so the route-level test (which mocks logAuditEvent) stayed
 * green. This test runs the real insert against the DB to close that gap:
 *   1. The raw shape the route used to send is rejected by the FK (guards the
 *      premise — if the FK is ever dropped, this tells you the null is moot).
 *   2. The shape the route sends now (userId null, id in metadata) is written.
 *
 * Runs against the real Supabase DB — cleans up after itself.
 */

import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit/log'

const DB_AVAILABLE =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY

// A valid UUID that never has a User row — same situation as an orphaned webhook.
const ORPHAN_USER_ID = randomUUID()
// Tags every row this test writes so cleanup can't touch real audit history.
const TEST_MARKER = `audit-event-fk-test-${ORPHAN_USER_ID}`

describe.skipIf(!DB_AVAILABLE)('X14 — subscription_orphaned audit row reaches the DB', () => {
  const admin = DB_AVAILABLE ? createAdminClient() : null!

  afterAll(async () => {
    await admin.from('AuditEvent').delete().eq('metadata->>testMarker', TEST_MARKER)
  })

  it('userId pointing at a missing User row is rejected by the FK (23503)', async () => {
    const { error } = await admin.from('AuditEvent').insert({
      userId: ORPHAN_USER_ID,
      eventType: 'subscription_orphaned',
      status: 'failure',
      metadata: { testMarker: TEST_MARKER },
    })
    expect(error?.code).toBe('23503')
  })

  it('logAuditEvent with userId null + lsUserId in metadata writes the row', async () => {
    // Mirrors the call in app/api/billing/webhook/route.ts's orphan branch.
    await logAuditEvent({
      userId: null,
      eventType: 'subscription_orphaned',
      status: 'failure',
      metadata: {
        lsUserId: ORPHAN_USER_ID,
        lsEvent: 'subscription_updated',
        lsSubscriptionId: 'sub_audit_fk_test',
        note: 'user_id valid UUID but no matching User row',
        testMarker: TEST_MARKER,
      },
    })

    const { data, error } = await admin
      .from('AuditEvent')
      .select('userId, eventType, status, metadata')
      .eq('metadata->>testMarker', TEST_MARKER)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({
      userId: null,
      eventType: 'subscription_orphaned',
      status: 'failure',
      metadata: { lsUserId: ORPHAN_USER_ID },
    })
  })
})
