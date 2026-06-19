// Returns the canonical origin (scheme://host[:port]) — strips paths and trailing slashes.
// Throws synchronously if SITE_URL is set but malformed, so the misconfiguration surfaces
// at app boot instead of on the first auth-callback redirect.
export function getBaseUrl(): string {
  const raw = process.env.SITE_URL ?? 'http://localhost:3000'
  return new URL(raw).origin
}
