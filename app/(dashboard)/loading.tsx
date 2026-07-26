// Instant fallback shown while a top-level dashboard page renders on the
// server, so tab switches (תחקור / חיפוש / הזנת טריידים / פרופיל) show an
// immediate frame instead of freezing on the previous page. Deliberately
// neutral — a title strip, a KPI-style card row, and a wide content block —
// since the tabs render quite different content (analytics / table / form).
export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <span role="status" className="sr-only">
        טוען…
      </span>
      <div
        className="h-7 w-56 rounded bg-shade animate-pulse"
        aria-hidden="true"
      />
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse"
        aria-hidden="true"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-panel-3" />
        ))}
      </div>
      <div
        className="h-72 rounded-lg bg-panel-3 animate-pulse"
        aria-hidden="true"
      />
    </div>
  )
}
