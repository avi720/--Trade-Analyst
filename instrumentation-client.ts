import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  enabled: process.env.NODE_ENV === 'production',
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
