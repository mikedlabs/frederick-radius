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
  kickWarmOnBoot();

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

/**
 * Deploy-time cache warm kick.
 *
 * Every unstable_cache key embeds VERCEL_GIT_COMMIT_SHA, so a deploy empties
 * ALL data caches at once. The 5-minute warm-events cron refills them, but
 * until its next tick the first visitors pay the full cold-miss TTFB (~8s
 * awaiting the slow municipal feeds). This closes that window: the first
 * server boot of a new deployment fires the SAME warming the cron does.
 *
 * WHY AN HTTP SELF-CALL AND NOT A DIRECT FUNCTION CALL
 * ----------------------------------------------------
 * register() runs at instance boot, BEFORE any request: there is no request
 * store and globalThis.__incrementalCache is not set yet (Next only wires it
 * inside request handling), so calling the unstable_cache-wrapped loaders here
 * throws "Invariant: incrementalCache missing". And even if it didn't, a
 * detached in-process promise would be frozen the moment this lambda finishes
 * its response. Kicking the existing cron route instead gives the warm work
 * its own invocation with full request context and maxDuration=90, and it runs
 * to completion regardless of what happens to this instance.
 *
 * FIRE-AND-FORGET: the fetch is not awaited, so it never delays boot or the
 * user request that triggered the cold start. Idempotency lives in the route:
 * serverless boots once PER LAMBDA (scale-out and idle-expiry keep cold-
 * starting instances for the deployment's whole life), so the route dedupes
 * boot kicks with a Data Cache claim keyed by the deploy SHA — after the
 * first kick warms, later kicks return immediately. Fail-soft everywhere:
 * any error is swallowed and the 5-minute cron remains the backstop.
 */
function kickWarmOnBoot(): void {
  // nodejs runtime only (register also runs in the edge runtime), production
  // only (no point warming previews; locally VERCEL_ENV is unset), and never
  // during `next build` (build workers run register too, and a kick from the
  // build would hit the PREVIOUS deployment's routes anyway).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const secret = process.env.CRON_SECRET;
  // The production alias, not VERCEL_URL: a production lambda only cold-boots
  // once the alias already routes to this deployment, and the alias is public
  // while deployment-specific URLs can sit behind Vercel deployment protection.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!secret || !host) return;

  void fetch(`https://${host}/api/cron/warm-events?source=boot`, {
    headers: { authorization: `Bearer ${secret}` },
  }).catch(() => {
    // Swallow: warming is best-effort; the cron refills within 5 minutes.
  });
}

// Captures errors thrown in Server Components, route handlers, and
// server actions (the 500s the brief cares about).
export const onRequestError = Sentry.captureRequestError;
