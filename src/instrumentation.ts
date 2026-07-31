/**
 * Sentry, minimum viable. Brief section 8.2.
 *
 * The goal is exactly "errors and 500s are visible", nothing more: a
 * 10 percent trace sample, no session replay, no profiling, and no
 * user identifiers. When no DSN is configured Sentry initializes
 * nothing, so a missing secret is a safe no-op rather than a build or
 * runtime failure, and no data ever leaves the process.
 */
import * as Sentry from "@sentry/nextjs";

export function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      enableLogs: false,
    });
  }
}

// Captures errors thrown in Server Components, route handlers, and
// server actions (the 500s the brief cares about).
export const onRequestError = Sentry.captureRequestError;
