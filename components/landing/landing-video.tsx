'use client'

/**
 * Landing-page product demo video. Rendered inside the same mock-browser
 * chrome the synthetic demo used, so the visual language of the hero stays
 * consistent. Autoplays muted+inline (required by mobile) with native
 * controls so a visitor can pause and scrub.
 *
 * Arrow-key skip is overridden from the browser default of 10s → 5s so a
 * viewer can nudge to a specific scene without overshooting.
 */

import { useEffect, useRef } from 'react'

export function LandingVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    function onKey(e: KeyboardEvent) {
      const el = videoRef.current
      if (!el || document.activeElement !== el) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        el.currentTime = Math.min(el.duration || 0, el.currentTime + 5)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        el.currentTime = Math.max(0, el.currentTime - 5)
      }
    }
    v.addEventListener('keydown', onKey)
    return () => v.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative mx-auto mt-16 max-w-4xl" dir="rtl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -inset-y-6 -z-10 rounded-3xl bg-amber/5 blur-2xl"
      />

      <div
        className="rounded-xl border border-border p-4 shadow-2xl backdrop-blur-sm sm:p-6"
        style={{ background: 'rgba(17,17,17,0.8)' }}
      >
        <div className="mb-4 flex items-center gap-1.5 border-b border-border pb-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#333' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#333' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#333' }} />
          <span className="mr-3 font-mono text-xs" style={{ color: '#666' }}>
            trade-analyst.app
          </span>
        </div>

        <video
          ref={videoRef}
          src="/landing-demo.mp4"
          controls
          autoPlay
          muted
          playsInline
          preload="metadata"
          poster="/og-image.png"
          controlsList="nodownload"
          className="w-full rounded-lg"
          dir="ltr"
          aria-label="הדגמה של אתר Trade Analyst"
        >
          <track
            kind="captions"
            src="/landing-demo-captions.vtt"
            srcLang="he"
            label="עברית"
            default
          />
        </video>
      </div>
    </div>
  )
}
