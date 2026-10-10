/**
 * Sentry browser init, minimum viable. Brief section 8.2.
 *
 * Unhandled client errors only. No Session Replay, no profiling, no
 * Sentry.setUser, sendDefaultPii false: no PII and no user identifier
 * ever leaves the browser. Without NEXT_PUBLIC_SENTRY_DSN this is a
 * no-op.
 *
 * The SDK is imported after first paint. A static `@sentry/nextjs`
 * import was the shared 400KB+ chunk on /today and /events (~5 s of
 * mobile script time in the Oct 2026 traces).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      enableLogs: false,
    });
  });
}

// Tracing is off on purpose. Keep the Next.js hook so the SDK does not
// inject navigation instrumentation back into the first-load graph.
export function onRouterTransitionStart() {}
