'use client'

import { useSyncExternalStore } from 'react'

// The wall clock as an external store. `useHydrated()` + `Date.now()` in render
// would be the shorter spelling, but `Date.now` is impure and React forbids
// calling it during render (react-hooks/purity) — reading it through
// `getSnapshot` is the sanctioned way to pull a mutable outside value in.
let clientNow: number | null = null

function subscribe(onStoreChange: () => void): () => void {
  // Refresh on every (re)mount, so a client-side navigation back to the page
  // doesn't reuse a timestamp captured earlier in the session. React re-reads
  // the snapshot after subscribing, so the fresh value lands right away.
  clientNow = Date.now()
  onStoreChange()
  return () => {}
}

// Must return a stable value between calls — a bare `Date.now()` here would
// differ on every read and React would re-render forever.
const getSnapshot = () => (clientNow ??= Date.now())
const getServerSnapshot = () => null

/**
 * `Date.now()` on the client; `null` on the server and during the hydration
 * render, so timestamp-derived markup matches what the server sent. Callers
 * must render something for the `null` case — see `useHydrated` for the
 * general shape of this two-pass pattern.
 *
 * Does not tick. Consumers wanting a live clock need their own interval.
 */
export function useClientNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
