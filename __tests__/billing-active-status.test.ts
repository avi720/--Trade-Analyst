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
import { isActiveStatus } from '@/lib/billing/lemon-squeezy'

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
