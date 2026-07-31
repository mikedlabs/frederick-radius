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

const CI_FETCH_TRACE_GUARD = Symbol.for("frederick-radius.ci-fetch-trace");

function installCiFetchTrace() {
  if (
    process.env.RADIUS_CI_ASYNC_TRACE !== "1" ||
    process.env.NEXT_RUNTIME !== "nodejs"
  ) return;

  const tracedGlobal = globalThis as typeof globalThis & {
    [CI_FETCH_TRACE_GUARD]?: boolean;
  };
  if (tracedGlobal[CI_FETCH_TRACE_GUARD]) return;
  tracedGlobal[CI_FETCH_TRACE_GUARD] = true;

  const originalFetch = globalThis.fetch.bind(globalThis);
  let nextId = 0;
  globalThis.fetch = async (input, init) => {
    const id = ++nextId;
    const startedAt = Date.now();
    let destination = "unparseable";
    let method = init?.method ?? "GET";
    try {
      const raw =
        typeof input === "string" || input instanceof URL
          ? input.toString()
          : input.url;
      const parsed = new URL(raw);
      destination = `${parsed.origin}${parsed.pathname}`;
      if (typeof input !== "string" && !(input instanceof URL)) {
        method = init?.method ?? input.method;
      }
    } catch {
      // Never print a raw URL: it may contain an API key in its query string.
    }
    console.info(`FR_ASYNC|FETCH|START|${id}|${method}|${destination}`);
    const pending10 = setTimeout(() => {
      console.info(`FR_ASYNC|FETCH|PENDING_10S|${id}|${destination}`);
    }, 10_000);
    const pending30 = setTimeout(() => {
      console.info(`FR_ASYNC|FETCH|PENDING_30S|${id}|${destination}`);
    }, 30_000);
    try {
      const response = await originalFetch(input, init);
      console.info(
        `FR_ASYNC|FETCH|END|${id}|${response.status}|${Date.now() - startedAt}ms|${destination}`,
      );
      return response;
    } catch (error) {
      console.info(
        `FR_ASYNC|FETCH|ERROR|${id}|${Date.now() - startedAt}ms|${destination}|${
          error instanceof Error ? error.name : "Unknown"
        }`,
      );
      throw error;
    } finally {
      clearTimeout(pending10);
      clearTimeout(pending30);
    }
  };
}

export function register() {
  installCiFetchTrace();
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
