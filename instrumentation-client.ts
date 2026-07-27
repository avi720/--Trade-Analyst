import * as Sentry from '@sentry/nextjs'
import { readMonitoringConsent } from '@/lib/consent/consent'

// Client-side Sentry is an optional "monitoring" cookie category — it reports
// errors and captures on-error session replay from the visitor's browser, so it
// stays off until the user opts in. Read the consent cookie synchronously at
// load; a monitoring-consent change takes effect on the next page load (the
// preferences UI states this). Server/edge Sentry configs never touch the
// browser and are unaffected.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  enabled: process.env.NODE_ENV === 'production' && readMonitoringConsent(),
  sendDefaultPii: false,
  // X7: financial-data app — masking policy is explicit, not inherited from
  // whatever version of the SDK npm resolves. Every replay captured on
  // error must reach Sentry with:
  //   - all text nodes masked (P&L, tickers, chat, prices)
  //   - all inputs masked (email, phone, form fields)
  //   - media (avatars, screenshots) blocked
  //   - no network request/response bodies captured
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      networkDetailAllowUrls: [],
    }),
  ],
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
