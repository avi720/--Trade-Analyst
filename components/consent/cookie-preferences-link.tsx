'use client'

import { useConsent } from './consent-provider'

/**
 * Footer affordance to re-open the cookie preferences panel. A button (not a
 * link) so it works for anonymous visitors too — /profile would bounce them to
 * login. Styled to match the surrounding FooterLink anchors.
 */
export function CookiePreferencesLink() {
  const { openPreferences } = useConsent()
  return (
    <button
      type="button"
      onClick={openPreferences}
      className="text-right transition-colors hover:text-text-main"
    >
      העדפות עוגיות
    </button>
  )
}
