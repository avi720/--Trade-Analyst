import { describe, it, expect, beforeAll } from 'vitest'
import { createCipheriv, randomBytes } from 'crypto'
import { encryptToken, decryptToken } from '@/lib/ibkr/encrypt'

const TEST_KEY_HEX = 'a'.repeat(64) // 32 bytes of 0xaa

beforeAll(() => {
  process.env.FLEX_TOKEN_ENCRYPTION_KEY = TEST_KEY_HEX
})

// Builds a legacy (pre-v1) 3-part ciphertext using the same AES-256-GCM
// construction, so we can verify decryptToken still accepts it.
function legacyEncrypt(plain: string): string {
  const key = Buffer.from(TEST_KEY_HEX, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), ct.toString('hex')].join(':')
}

describe('encryptToken / decryptToken', () => {
  it('round-trips a value through v1 format', () => {
    const enc = encryptToken('flex-secret-123')
    expect(enc.startsWith('v1:')).toBe(true)
    expect(decryptToken(enc)).toBe('flex-secret-123')
  })

  it('decrypts a legacy (pre-v1) 3-part ciphertext', () => {
    const legacy = legacyEncrypt('flex-secret-legacy')
    expect(legacy.split(':').length).toBe(3)
    expect(decryptToken(legacy)).toBe('flex-secret-legacy')
  })

  it('rejects an unknown version prefix', () => {
    const enc = encryptToken('whatever')
    const tampered = enc.replace(/^v1:/, 'v9:')
    expect(() => decryptToken(tampered)).toThrow(/Unsupported encrypted-token version/)
  })

  it('rejects a malformed (2-part) ciphertext', () => {
    expect(() => decryptToken('only:two')).toThrow(/Invalid encrypted token format/)
  })
})
