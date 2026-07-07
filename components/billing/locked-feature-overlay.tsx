'use client'

import Link from 'next/link'
import { Sparkles, Lock } from 'lucide-react'
import type { ReactNode } from 'react'

interface LockedFeatureOverlayProps {
  title: string
  description: string
  ctaLabel?: string
  ctaHref?: string
  children: ReactNode
}

export function LockedFeatureOverlay({
  title,
  description,
  ctaLabel = 'צפה במסלולים ←',
  ctaHref = '/profile?tab=billing',
  children,
}: LockedFeatureOverlayProps) {
  return (
    // Fixed viewport-sized block so the overlay lands at the same vertical
    // position on every tab (short content like Excel would otherwise shrink
    // the box and place the panel much higher than on the taller trade forms).
    // Tall content behind is clipped; short content leaves whitespace behind
    // the panel — both fine since the background is decorative.
    <div className="relative h-[calc(100vh_-_14rem)] overflow-hidden">
      {/* Faded preview of the real tab content — kept in the DOM so the user
          sees what they'd unlock, but disabled from receiving any interaction. */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none opacity-30 blur-[1px]"
      >
        {children}
      </div>

      {/* Centered paywall panel */}
      <div
        role="dialog"
        aria-labelledby="locked-feature-title"
        className="pointer-events-none absolute inset-0 flex items-center justify-center px-4"
      >
        <div className="pointer-events-auto w-full max-w-md rounded-xl border border-amber/40 bg-panel-bg/95 p-6 shadow-2xl backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber">
              <Lock size={18} strokeWidth={2.25} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h3
                id="locked-feature-title"
                className="flex items-center gap-1.5 text-base font-semibold text-text-main"
              >
                {title}
                <span
                  className="inline-flex items-center gap-0.5 rounded-full bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber"
                  aria-hidden="true"
                >
                  <Sparkles size={10} strokeWidth={2.5} />
                  Pro
                </span>
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-dim">
                {description}
              </p>
              <Link
                href={ctaHref}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-amber px-5 py-2 text-sm font-semibold text-bg-dark transition-colors hover:bg-amber/90"
              >
                {ctaLabel}
              </Link>
              <p className="mt-2 text-xs text-text-dim">14 ימי ניסיון חינם · ביטול בכל עת</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
