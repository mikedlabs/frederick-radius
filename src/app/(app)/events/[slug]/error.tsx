"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CalendarClock, RefreshCw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/Button";

/**
 * Event lookups deliberately throw on a transient feed timeout instead of
 * returning a false 404. This route-scoped boundary gives that honest state a
 * useful recovery path while leaving true misses to not-found.tsx.
 *
 * Keep this separate from loading.tsx: a loading boundary on this open dynamic
 * segment can stream HTTP 200 before notFound() resolves and recreate the soft
 * 404 problem documented in page.tsx.
 */
export default function EventLookupError({
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
    <div
      role="alert"
      className="mx-auto flex min-h-[58vh] max-w-md flex-col items-center justify-center gap-5 px-6 py-14 text-center"
    >
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-full border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          color: "var(--app-brand)",
        }}
      >
        <CalendarClock className="h-7 w-7" strokeWidth={1.6} aria-hidden />
      </span>

      <div className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          The calendar is still checking.
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          This event could not be confirmed yet.
        </h1>
        <p
          className="text-pretty text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          One of the event sources took too long to answer. Try the lookup
          again, or open the full calendar while it recovers.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          onClick={reset}
          iconLeft={
            <RefreshCw className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          }
        >
          Try again
        </Button>
        <Button href="/events" variant="secondary">
          See all events
        </Button>
      </div>

      <Link
        href="/today"
        className="tap-44 inline-flex items-center text-[12px] font-semibold"
        style={{ color: "var(--app-ink-3)" }}
      >
        Return to Today
      </Link>
    </div>
  );
}
