// Shared admin content-area skeleton. Used by both app/(dashboard)/admin/
// loading.tsx (first entry into the admin section, where the Suspense boundary
// newly mounts) and AdminLayout's client-side pending state (sibling sub-tab
// switches, where an already-resolved Suspense boundary would otherwise keep
// the previous page frozen on screen). Mirrors the shared admin page frame
// (max-w-6xl header + table rows).
export function AdminContentSkeleton() {
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
