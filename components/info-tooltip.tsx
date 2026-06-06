'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'

interface Props {
  label: string
  children: React.ReactNode
  /** Align popover edge: 'start' = align with right edge (default in RTL), 'end' = left edge. */
  align?: 'start' | 'end'
}

/**
 * Small info button (ⓘ) that toggles a popover on click. Used to attach
 * "what this metric means / how it's calculated / why it matters" notes
 * next to every metric card and chart on the research dashboard.
 */
export function InfoTooltip({ label, children, align: alignProp = 'start' }: Props) {
  const [open, setOpen] = useState(false)
  const [align, setAlign] = useState<'start' | 'end'>(alignProp)
  // Hide the popover for the first commit after open so we can measure and
  // flip alignment before the browser paints — prevents the "open in wrong
  // position then jump" flicker on the leftmost cards.
  const [measured, setMeasured] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Auto-flip alignment so the popover stays within the viewport. In RTL,
  // align='start' anchors the popover's right edge to the button and grows
  // leftward — fine for cards on the right of the page, but the leftmost
  // cards overflow. We measure synchronously in useLayoutEffect (runs before
  // paint) and reveal the popover only after the correct align is applied.
  useLayoutEffect(() => {
    if (!open) {
      setMeasured(false)
      setAlign(alignProp)
      return
    }
    // Only measure on the first commit after open (measured === false).
    // After we flip align, this effect re-runs; if we measured again the new
    // position would no longer overflow, we'd flip back, and bounce forever.
    if (measured) return
    const pop = popRef.current
    if (!pop) return
    const rect = pop.getBoundingClientRect()
    const pad = 8
    let next: 'start' | 'end' = alignProp
    if (rect.left < pad) next = 'end'
    else if (rect.right > window.innerWidth - pad) next = 'start'
    if (next !== align) setAlign(next)
    setMeasured(true)
  }, [open, alignProp, align, measured])

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="text-[#888888] hover:text-[#FFB800] transition-colors flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFB800] focus-visible:outline-offset-2"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="4.6" r="0.95" fill="currentColor" />
          <rect x="7.25" y="6.8" width="1.5" height="5.4" rx="0.6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={label}
          dir="rtl"
          className={`absolute z-50 top-6 ${align === 'end' ? 'left-0' : 'right-0'} w-[22rem] max-w-[88vw] p-3.5 text-sm leading-relaxed text-[#E0E0E0] font-sans shadow-xl rounded`}
          style={{ background: '#0E0E0E', border: '1px solid #333333', visibility: measured ? 'visible' : 'hidden' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
