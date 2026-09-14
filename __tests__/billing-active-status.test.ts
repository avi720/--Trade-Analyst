/**
 * Unit tests for X6 — isActiveStatus narrow.
 *
 * Owner decision 2026-07-07 (0-day dunning): only `on_trial` and `active`
 * grant Pro. Every other Lemon Squeezy status — including `past_due`,
 * `paused`, `unpaid`, `cancelled`, `expired` — downgrades to Free.
 *
 * These tests are the regression guard against silently re-widening the
 * function (e.g., "let's give past_due a 3-day grace period") without a
 * matching owner decision.
 */

import { describe, it, expect } from 'vitest'
import { isActiveStatus, grantsPro } from '@/lib/billing/lemon-squeezy'

describe('X6 — isActiveStatus grants Pro only for on_trial + active', () => {
  it('active → Pro', () => {
    expect(isActiveStatus('active')).toBe(true)
  })

  it('on_trial → Pro', () => {
    expect(isActiveStatus('on_trial')).toBe(true)
  })

  it('past_due → Free (was Pro before X6; 0-day dunning per owner)', () => {
    expect(isActiveStatus('past_due')).toBe(false)
  })

  it.each(['paused', 'unpaid', 'cancelled', 'expired', ''])(
    '%s → Free',
    (status) => {
      expect(isActiveStatus(status)).toBe(false)
    },
  )

  it('unknown / typoed status → Free (fail-closed)', () => {
    expect(isActiveStatus('actve')).toBe(false)
    expect(isActiveStatus('ACTIVE')).toBe(false) // case-sensitive per LS spec
    expect(isActiveStatus('unrecognized_status')).toBe(false)
  })
})

// isActiveStatus above still reports `cancelled` as inactive — that stays true.
// What changed (owner decision 2026-09-14) is the tier decision on top of it:
// a cancelled subscription keeps Pro until its paid period ends.
describe('grantsPro — cancelled keeps Pro until the paid period ends', () => {
  const NOW = Date.parse('2026-09-14T12:00:00Z')

  it('active / on_trial → Pro regardless of ends_at', () => {
    expect(grantsPro('active', null, NOW)).toBe(true)
    expect(grantsPro('on_trial', null, NOW)).toBe(true)
  })

  it('cancelled monthly, 8 days left in the period → Pro', () => {
    expect(grantsPro('cancelled', '2026-09-22T19:03:14.000000Z', NOW)).toBe(true)
  })

  it('cancelled annual, ~11 months left in the period → Pro', () => {
    expect(grantsPro('cancelled', '2027-08-06T10:00:00.000000Z', NOW)).toBe(true)
  })

  it('cancelled, period already over → Free', () => {
    expect(grantsPro('cancelled', '2026-09-14T11:59:59.000000Z', NOW)).toBe(false)
  })

  it('cancelled with a missing or unparseable ends_at → Free (fail-closed)', () => {
    expect(grantsPro('cancelled', null, NOW)).toBe(false)
    expect(grantsPro('cancelled', 'not-a-date', NOW)).toBe(false)
  })

  it.each(['expired', 'past_due', 'unpaid', 'paused'])(
    '%s → Free even with a future ends_at (only cancelled gets the grace)',
    (status) => {
      expect(grantsPro(status, '2027-08-06T10:00:00.000000Z', NOW)).toBe(false)
    },
  )
})
