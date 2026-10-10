/**
 * Sentry browser init, minimum viable. Brief section 8.2.
 *
 * Unhandled client errors only. No Session Replay, no profiling, no
 * Sentry.setUser, sendDefaultPii false: no PII and no user identifier
 * ever leaves the browser. Without NEXT_PUBLIC_SENTRY_DSN this is a
 * no-op.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    enableLogs: false,
  });
}

// Tracing is off on purpose: the Sentry client SDK was the shared 400KB+
// chunk on /today and /events. Keep unhandled-error capture only.
export function onRouterTransitionStart() {}
