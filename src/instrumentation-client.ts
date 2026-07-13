/**
 * Sentry browser init, minimum viable. Brief section 8.2.
 *
 * Unhandled client errors only. No Session Replay, no profiling, no
 * Sentry.setUser, sendDefaultPii false: no PII and no user identifier
 * ever leaves the browser. Without NEXT_PUBLIC_SENTRY_DSN this is a
 * no-op.
 */
import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    { path: "/api/ask", method: "POST" },
    { path: "/api/beta/email", method: "POST" },
    { path: "/api/feedback", method: "POST" },
  ],
});

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    enableLogs: false,
  });
}

// Required by the Sentry Next.js SDK to instrument client navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
