"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body className="bg-bg-dark text-text-main min-h-dvh font-sans">
        <main className="min-h-dvh flex items-center justify-center px-6">
          <div className="flex flex-col items-center gap-6 max-w-md text-center">
            <h1 className="text-2xl font-semibold">משהו השתבש</h1>
            <p className="text-text-dim">אירעה שגיאה לא צפויה. אנא נסה שוב.</p>
            {error.digest ? (
              <p className="font-mono text-xs text-text-dim">שגיאה: {error.digest}</p>
            ) : null}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-amber text-bg-dark hover:bg-amber/90 transition-colors"
              >
                נסה שוב
              </button>
              <a href="/" className="text-sm text-text-dim hover:text-text-main transition-colors">
                חזרה לדף הבית
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
