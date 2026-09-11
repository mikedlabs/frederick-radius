"use client";

import { useEffect } from "react";
import { RefreshCw, Compass } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/Button";

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
        Page error
      </p>
      <h1
        className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
        style={{ color: "var(--app-ink)" }}
      >
        This page could not load.
      </h1>
      <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        Frederick Radius could not finish loading this page. Try again or
        return to Today.
      </p>
      <div className="flex items-center gap-2.5 pt-1">
        <Button
          onClick={reset}
          iconLeft={<RefreshCw className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
        >
          Try again
        </Button>
        <Button
          href="/today"
          variant="secondary"
          iconLeft={<Compass className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
        >
          Back to Today
        </Button>
      </div>
    </div>
  );
}
