"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Compass } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

/**
 * Route-level error state for every app page (refinement audit F2: the
 * app had ZERO error.tsx files — a data blowup anywhere fell through to
 * a bare boundary with no direction). Matches the not-found page's
 * field-guide voice: calm, honest, and it gives the user two real moves.
 * `reset()` re-renders the segment; the data underneath is untouched.
 *
 * The boundary RENDERS the fallback but used to swallow the error silently;
 * report it to Sentry (with the digest that ties it to the server-side log)
 * so route crashes are actually actionable.
 */
export default function AppError({
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
    <div role="alert" className="relative mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center gap-4 text-center">
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Off the trail
      </p>
      <h1
        className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
        style={{ color: "var(--app-ink)" }}
      >
        This page hit a snag.
      </h1>
      <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        The county data is fine. The page just failed to draw. Try it
        again, or head back to the guide.
      </p>
      <div className="flex items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={reset}
          className="tactile tactile-interactive inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold"
          style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand, #fff)" }}
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Try again
        </button>
        <Link
          href="/today"
          className="tactile tactile-interactive inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[13px] font-semibold"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <Compass className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </div>
    </div>
  );
}
