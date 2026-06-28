import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {}

export default withSentryConfig(nextConfig, {
  org: 'avior-0b',
  project: 'trade-analyst',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  reactComponentAnnotation: { enabled: false },
})
