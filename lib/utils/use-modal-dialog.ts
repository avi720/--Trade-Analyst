'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Wires WAI-ARIA modal-dialog behavior into a panel:
 *  - Escape closes
 *  - Tab / Shift+Tab traps focus inside the panel
 *  - Initial focus moves to the first focusable element on open
 *  - Focus restores to the trigger element on close
 *
 * Attach the returned ref to the dialog root.
 */
export function useModalDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const root = ref.current
    if (!root) return

    const focusables = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    const first = focusables[0]
    if (first) first.focus()
    else root.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !root) return
      const list = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      if (list.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = list[0]
      const lastEl = list[list.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === firstEl || !root.contains(active)) {
          e.preventDefault()
          lastEl.focus()
        }
      } else {
        if (active === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return ref
}
