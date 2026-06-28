import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-bg-dark text-text-main flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="font-mono text-7xl text-text-dim">404</div>
        <h1 className="text-2xl font-semibold">הדף לא נמצא</h1>
        <p className="text-text-dim">הדף שחיפשת לא קיים או הוסר.</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-amber text-bg-dark hover:bg-amber/90 transition-colors"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </main>
  );
}
