"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import EventLookupRecovery from "@/components/event/EventLookupRecovery";

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

  return <EventLookupRecovery onRetry={reset} />;
}
