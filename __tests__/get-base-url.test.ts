import { describe, it, expect, afterEach } from 'vitest'
import { getBaseUrl } from '@/lib/utils'

const ORIGINAL = process.env.SITE_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SITE_URL
  else process.env.SITE_URL = ORIGINAL
})

describe('getBaseUrl', () => {
  it('falls back to localhost when SITE_URL is unset', () => {
    delete process.env.SITE_URL
    expect(getBaseUrl()).toBe('http://localhost:3000')
  })

  it('strips a trailing slash', () => {
    process.env.SITE_URL = 'https://example.com/'
    expect(getBaseUrl()).toBe('https://example.com')
  })

  it('strips a path', () => {
    process.env.SITE_URL = 'https://example.com/app/dashboard'
    expect(getBaseUrl()).toBe('https://example.com')
  })

  it('keeps a non-default port', () => {
    process.env.SITE_URL = 'https://example.com:8443'
    expect(getBaseUrl()).toBe('https://example.com:8443')
  })

  it('drops the default port for the scheme', () => {
    process.env.SITE_URL = 'http://example.com:80'
    expect(getBaseUrl()).toBe('http://example.com')
  })

  it('throws on a malformed URL', () => {
    process.env.SITE_URL = 'not-a-url'
    expect(() => getBaseUrl()).toThrow()
  })
})
