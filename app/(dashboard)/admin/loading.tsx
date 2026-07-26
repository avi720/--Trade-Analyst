// Instant fallback shown while an admin sub-page renders on the server. It
// lives inside AdminLayout's content <section>, so the admin sidebar stays
// mounted and only the content column shimmers when switching admin tabs —
// the exact navigation that motivated the latency work. Mirrors the shared
// admin page frame (max-w-6xl header + table rows).
export default function AdminLoading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <span role="status" className="sr-only">
        טוען…
      </span>
      <div className="space-y-2 animate-pulse" aria-hidden="true">
        <div className="h-6 w-48 rounded bg-shade" />
        <div className="h-4 w-full max-w-2xl rounded bg-panel-3" />
      </div>
      <div className="space-y-2 animate-pulse" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-11 w-full rounded bg-panel-3" />
        ))}
      </div>
    </div>
  )
}
