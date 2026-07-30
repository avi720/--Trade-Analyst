import { describe, expect, it } from 'vitest'
import {
  evaluateGeoAccess,
  isBypassGrant,
  isGeoGateEnabled,
  isGeoOpenPath,
  parseAllowedCountries,
  resolveCountry,
} from '@/lib/geo/gate'

const ON = { GEO_GATE_ENABLED: 'true' } as Record<string, string | undefined>

/** Headers carrying a Vercel-resolved country. Omit to simulate a non-Vercel host. */
function headers(country?: string): Headers {
  return new Headers(country ? { 'x-vercel-ip-country': country } : {})
}

function evaluate(
  pathname: string,
  country: string | undefined,
  env: Record<string, string | undefined> = ON,
  bypassCookie?: string,
) {
  return evaluateGeoAccess({ pathname, headers: headers(country), bypassCookie }, env)
}

describe('isGeoOpenPath', () => {
  it('keeps the SEO-indexed marketing surface open', () => {
    // Blocking any of these deindexes the site (robots index:true + JSON-LD on /).
    for (const path of [
      '/',
      '/pricing',
      '/terms',
      '/privacy',
      '/ibkr-sync',
      '/fifo-analytics',
      '/ai-trading-assistant',
    ]) {
      expect(isGeoOpenPath(path), path).toBe(true)
    }
  })

  it('keeps /og open for social crawlers', () => {
    // WhatsApp / Facebook / LinkedIn fetch this from outside Israel to render link previews.
    expect(isGeoOpenPath('/og')).toBe(true)
  })

  it('keeps the Lemon Squeezy webhook open', () => {
    // Billing would silently break — LS posts from US infra.
    expect(isGeoOpenPath('/api/billing/webhook')).toBe(true)
  })

  it('does not open the app, auth pages, or other API routes', () => {
    for (const path of [
      '/login',
      '/signup',
      '/auth/callback',
      '/research',
      '/profile',
      '/admin/users',
      '/api/profile',
      '/api/trades/manual',
    ]) {
      expect(isGeoOpenPath(path), path).toBe(false)
    }
  })

  it('matches exactly — a prefix of an open path is not open', () => {
    expect(isGeoOpenPath('/pricing/secret')).toBe(false)
    expect(isGeoOpenPath('/api/billing/webhook/replay')).toBe(false)
  })
})

describe('isGeoGateEnabled', () => {
  it('is off unless GEO_GATE_ENABLED is exactly "true"', () => {
    expect(isGeoGateEnabled({})).toBe(false)
    expect(isGeoGateEnabled({ GEO_GATE_ENABLED: 'false' })).toBe(false)
    expect(isGeoGateEnabled({ GEO_GATE_ENABLED: '1' })).toBe(false)
    expect(isGeoGateEnabled({ GEO_GATE_ENABLED: 'TRUE' })).toBe(false)
    expect(isGeoGateEnabled({ GEO_GATE_ENABLED: 'true' })).toBe(true)
  })
})

describe('parseAllowedCountries', () => {
  it('defaults to Israel when unset or empty', () => {
    expect([...parseAllowedCountries(undefined)]).toEqual(['IL'])
    expect([...parseAllowedCountries('')]).toEqual(['IL'])
    expect([...parseAllowedCountries('  ,  ,')]).toEqual(['IL'])
  })

  it('parses a list, tolerating case and whitespace', () => {
    // A stray " il" pasted into the Vercel dashboard must not lock everyone out.
    const parsed = parseAllowedCountries(' il , us,DE ')
    expect(parsed.has('IL')).toBe(true)
    expect(parsed.has('US')).toBe(true)
    expect(parsed.has('DE')).toBe(true)
    expect(parsed.size).toBe(3)
  })
})

describe('resolveCountry', () => {
  it('returns null when the host provides no country header', () => {
    expect(resolveCountry(headers())).toBeNull()
  })

  it('normalises to upper case', () => {
    expect(resolveCountry(headers('il'))).toBe('IL')
  })

  it('treats a blank header as absent', () => {
    expect(resolveCountry(new Headers({ 'x-vercel-ip-country': '   ' }))).toBeNull()
  })
})

describe('evaluateGeoAccess — fail-open branches', () => {
  it('allows everything while the gate is disabled', () => {
    const decision = evaluate('/research', 'US', {})
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('gate_disabled')
  })

  it('allows when no country header is present (localhost / next dev)', () => {
    // Failing closed here would break local development entirely.
    const decision = evaluate('/research', undefined)
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('no_country_header')
  })

  it('allows when Vercel could not geolocate the request (XX)', () => {
    const decision = evaluate('/research', 'XX')
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('unknown_country')
  })
})

describe('evaluateGeoAccess — enforcement', () => {
  it('allows Israel into the app', () => {
    const decision = evaluate('/research', 'IL')
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('country_allowed')
  })

  it('blocks a foreign country from the app and the API', () => {
    for (const path of ['/research', '/login', '/signup', '/api/profile']) {
      const decision = evaluate(path, 'US')
      expect(decision.allowed, path).toBe(false)
      expect(decision.reason).toBe('country_blocked')
    }
  })

  it('lets a foreign country reach the marketing pages', () => {
    // Googlebot crawls from the US; this is what keeps the site indexed.
    for (const path of ['/', '/pricing', '/og', '/api/billing/webhook']) {
      const decision = evaluate(path, 'US')
      expect(decision.allowed, path).toBe(true)
      expect(decision.reason).toBe('open_path')
    }
  })

  it('honours a widened allow-list', () => {
    const env = { ...ON, GEO_ALLOWED_COUNTRIES: 'IL,US' }
    expect(evaluate('/research', 'US', env).allowed).toBe(true)
    expect(evaluate('/research', 'DE', env).allowed).toBe(false)
  })

  it('reports the resolved country on both outcomes', () => {
    expect(evaluate('/research', 'IL').country).toBe('IL')
    expect(evaluate('/research', 'US').country).toBe('US')
  })
})

describe('evaluateGeoAccess — bypass cookie', () => {
  const env = { ...ON, GEO_BYPASS_SECRET: 's3cret' }

  it('admits a blocked country holding the matching cookie', () => {
    const decision = evaluate('/research', 'US', env, 's3cret')
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('bypass_cookie')
  })

  it('rejects a wrong cookie value', () => {
    expect(evaluate('/research', 'US', env, 'wrong').allowed).toBe(false)
  })

  it('is inert when no secret is configured', () => {
    // Guards against an unset env var being satisfied by an empty cookie.
    expect(evaluate('/research', 'US', ON, '').allowed).toBe(false)
    expect(evaluate('/research', 'US', ON, 'anything').allowed).toBe(false)
  })

  it('cannot be satisfied by an empty cookie even when a secret is set', () => {
    expect(evaluate('/research', 'US', env, '').allowed).toBe(false)
    expect(evaluate('/research', 'US', env, undefined).allowed).toBe(false)
  })
})

describe('isBypassGrant', () => {
  const env = { GEO_BYPASS_SECRET: 's3cret' }

  it('grants on an exact secret match', () => {
    expect(isBypassGrant(new URLSearchParams('geo_bypass=s3cret'), env)).toBe(true)
  })

  it('does not grant on a mismatch or a missing param', () => {
    expect(isBypassGrant(new URLSearchParams('geo_bypass=nope'), env)).toBe(false)
    expect(isBypassGrant(new URLSearchParams(''), env)).toBe(false)
  })

  it('never grants when no secret is configured', () => {
    expect(isBypassGrant(new URLSearchParams('geo_bypass='), {})).toBe(false)
    expect(isBypassGrant(new URLSearchParams('geo_bypass=anything'), {})).toBe(false)
  })
})
