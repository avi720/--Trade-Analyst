import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type FeatureBenefit = {
  Icon: LucideIcon
  title: string
  body: string
}

export type FeatureStep = {
  title: string
  body: string
}

export type FeatureLandingProps = {
  /** Small pill above the headline, e.g. "אינטגרציית IBKR". */
  eyebrow: string
  /** Hero headline. Pass a fragment to accent part of it with the amber span. */
  title: React.ReactNode
  /** One-paragraph hero subhead. */
  subtitle: string
  /** 2×2 grid of concrete benefits. */
  benefits: FeatureBenefit[]
  benefitsHeading: string
  /** Three-step "how it works" narrative. */
  steps: FeatureStep[]
  stepsHeading: string
  /** Closing CTA copy. */
  closingTitle: string
  closingBody?: string
}

/**
 * Shared template for the per-feature SEO landing pages (/ibkr-sync,
 * /fifo-analytics, /ai-trading-assistant). Server component — no client JS.
 * Content lives entirely in the page files that render this, so every page
 * shares one layout and can never drift on spacing, hierarchy, or CTA copy.
 * Rendered inside the (public) layout, so it inherits the header + footer.
 */
export function FeatureLanding({
  eyebrow,
  title,
  subtitle,
  benefits,
  benefitsHeading,
  steps,
  stepsHeading,
  closingTitle,
  closingBody,
}: FeatureLandingProps) {
  return (
    <div className="relative">
      {/* Ambient amber glow, echoing the landing hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 -z-0 mx-auto h-[320px] max-w-3xl opacity-80"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(255,184,0,0.14) 0%, rgba(255,184,0,0.03) 40%, transparent 70%)',
        }}
      />

      {/* Hero */}
      <div className="relative text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-panel-bg/60 px-3 py-1 text-xs text-text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-green" />
          {eyebrow}
        </div>

        <h1 className="text-3xl font-bold leading-tight text-text-main sm:text-4xl">
          {title}
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-text-dim">
          {subtitle}
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-amber px-6 py-3 text-sm font-semibold text-bg-dark transition-all hover:bg-amber/90 hover:shadow-[0_0_24px_-4px_rgba(255,184,0,0.5)]"
          >
            הירשם עכשיו חינם
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-panel-bg px-6 py-3 text-sm font-medium text-text-main transition-colors hover:border-amber hover:text-amber"
          >
            כבר יש לי חשבון
          </Link>
        </div>
      </div>

      {/* Benefits */}
      <section className="relative mt-20">
        <h2 className="text-center text-2xl font-semibold text-text-main">
          {benefitsHeading}
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {benefits.map(({ Icon, title: bTitle, body }) => (
            <div
              key={bTitle}
              className="rounded-xl border border-border bg-panel-bg p-6"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber/10 text-amber">
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
              </div>
              <h3 className="text-base font-semibold text-text-main">{bTitle}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-dim">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative mt-20">
        <h2 className="text-center text-2xl font-semibold text-text-main">
          {stepsHeading}
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="rounded-xl border border-border bg-bg-dark/60 p-6"
            >
              <div className="mb-4 font-mono text-2xl font-bold text-amber">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="text-base font-semibold text-text-main">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-dim">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative mt-20 text-center">
        <h2 className="text-2xl font-semibold text-text-main sm:text-3xl">
          {closingTitle}
        </h2>
        {closingBody && (
          <p className="mx-auto mt-3 max-w-md text-text-dim">{closingBody}</p>
        )}
        <Link
          href="/signup"
          className="group mt-7 inline-flex items-center justify-center gap-2 rounded-md bg-amber px-8 py-3 text-base font-semibold text-bg-dark transition-all hover:bg-amber/90 hover:shadow-[0_0_28px_-4px_rgba(255,184,0,0.5)]"
        >
          התחל חינם
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
        </Link>
      </section>
    </div>
  )
}
