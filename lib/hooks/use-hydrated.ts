'use client'

import { useSyncExternalStore } from 'react'

// A store that never changes: the only transition is server → client, which
// React performs on its own by switching from `getServerSnapshot` to
// `getSnapshot` once hydration finishes. So `subscribe` has nothing to listen
// to and returns a no-op unsubscribe. Both are module-level constants because
// `useSyncExternalStore` re-subscribes whenever `subscribe` changes identity.
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

/**
 * `false` while rendering on the server *and* during the hydration render;
 * `true` from the first render after hydration.
 *
 * Use this to read browser-only sources (`localStorage`, `document.cookie`,
 * `Date.now()`) without a hydration mismatch. The naive alternative — reading
 * them in a mount effect and calling `setState` — produces the same two-pass
 * result but does it via a cascading render, which is what
 * `react-hooks/set-state-in-effect` flags.
 *
 * The value that depends on it must still be defaulted for the `false` pass,
 * and that default has to be what the server rendered.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
