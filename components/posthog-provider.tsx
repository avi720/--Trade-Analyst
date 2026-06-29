'use client'

// Importing this module triggers posthog.init() at module-load time
// (see lib/analytics/posthog.ts). The component itself is a pass-through
// — it exists so the root layout can mark this as a client boundary and
// Next.js will eagerly load the chunk on every page.
import '@/lib/analytics/posthog'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return children as React.ReactElement
}
