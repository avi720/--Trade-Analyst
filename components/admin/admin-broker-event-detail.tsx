'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'

interface Props {
  eventId: string
  onClose: () => void
}

interface EventDetail {
  id: string
  userId: string
  userEmail: string | null
  source: string
  eventType: string
  processingStatus: string
  processingError: string | null
  rawPayload: unknown
  receivedAt: string
  processedAt: string | null
}

function extractRawText(payload: unknown): { kind: 'xml' | 'json'; text: string } {
  // IBKR_FLEX events store { xml: string } (capped to 10000 chars in the
  // sync pipeline). Anything else gets pretty-printed as JSON.
  if (
    payload &&
    typeof payload === 'object' &&
    'xml' in payload &&
    typeof (payload as { xml: unknown }).xml === 'string'
  ) {
    return { kind: 'xml', text: (payload as { xml: string }).xml }
  }
  try {
    return { kind: 'json', text: JSON.stringify(payload, null, 2) }
  } catch {
    return { kind: 'json', text: String(payload) }
  }
}

export function AdminBrokerEventDetail({ eventId, onClose }: Props) {
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/broker-events/${eventId}`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(
            (j as { error?: string }).error ?? `HTTP ${r.status}`,
          )
        }
        return r.json() as Promise<EventDetail>
      })
      .then(json => {
        if (!cancelled) setDetail(json)
      })
      .catch(e => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'טעינת פרטי אירוע נכשלה')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const raw = detail ? extractRawText(detail.rawPayload) : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="פרטי אירוע ברוקר"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-panel border border-border rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-main truncate">
              {detail
                ? `${detail.eventType} · ${detail.source}`
                : 'אירוע ברוקר'}
            </h2>
            <p className="text-xs text-text-dim font-mono truncate">
              {detail ? `${detail.userEmail ?? '—'} · ${eventId}` : eventId}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="rounded-md p-1.5 text-text-dim hover:text-text-main hover:bg-panel-3"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-text-dim">
              <Loader2 size={14} className="animate-spin" />
              טוען פרטים…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red/30 bg-red/10 p-3 text-sm text-red">
              {error}
            </div>
          )}

          {detail && (
            <>
              <section>
                <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2">
                  Metadata
                </h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <dt className="text-text-dim">מקור</dt>
                  <dd className="text-text-main font-mono">{detail.source}</dd>
                  <dt className="text-text-dim">סוג</dt>
                  <dd className="text-text-main font-mono">{detail.eventType}</dd>
                  <dt className="text-text-dim">מצב</dt>
                  <dd className="text-text-main">{detail.processingStatus}</dd>
                  <dt className="text-text-dim">התקבל</dt>
                  <dd className="text-text-main font-mono">{detail.receivedAt}</dd>
                  <dt className="text-text-dim">עובד</dt>
                  <dd className="text-text-main font-mono">
                    {detail.processedAt ?? '—'}
                  </dd>
                </dl>
              </section>

              {detail.processingError && (
                <section>
                  <h3 className="text-xs font-semibold text-red uppercase tracking-wider mb-2">
                    Error
                  </h3>
                  <p className="text-sm text-red font-mono whitespace-pre-wrap">
                    {detail.processingError}
                  </p>
                </section>
              )}

              {raw && (
                <section>
                  <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2">
                    rawPayload ({raw.kind})
                  </h3>
                  <p className="text-xs text-text-dim mb-2">
                    XML הגולמי מוגבל ל-10K תווים ראשונים ב-sync pipeline
                    (`lib/ibkr/sync-pipeline.ts`) — התצוגה כאן היא מה שנשמר
                    בפועל, לא מלוא ה-XML שהתקבל.
                  </p>
                  <pre className="bg-input-bg border border-border rounded-md p-3 text-xs font-mono text-text-main overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                    {raw.text || '—'}
                  </pre>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
