import { NextResponse } from "next/server";
import {
  logEventArchiveFailure,
  loadTodayEventSnapshot,
  publicEventArchiveSourceHealth,
} from "@/lib/loaders/todayEventSnapshot";
import { EVENTS } from "@/data/events";
import { selectTodayEvents } from "@/lib/today-events";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";

// The event archive is a runtime database source. Prerendering this handler
// during an application build makes getSql() intentionally unavailable and
// can bake the tiny curated fallback into the public endpoint.
export const dynamic = "force-dynamic";

const HEALTHY_CACHE = "public, s-maxage=300, stale-while-revalidate=900";
const DEGRADED_CACHE = "private, no-store, max-age=0";
const REFRESH_RATE_LIMIT = 6;
const REFRESH_RATE_WINDOW_SECONDS = 60;

function refreshError(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": DEGRADED_CACHE,
        ...(status === 429
          ? { "Retry-After": String(REFRESH_RATE_WINDOW_SECONDS) }
          : {}),
      },
    },
  );
}

export async function GET(request?: Request) {
  const bypassCache = request
    ? new URL(request.url).searchParams.get("refresh") === "1"
    : false;
  if (bypassCache && request) {
    if (!isSameOriginRequest(request)) {
      return refreshError("forbidden-origin", 403);
    }
    if (
      await isRateLimited(
        request,
        "events-explicit-refresh",
        REFRESH_RATE_LIMIT,
        REFRESH_RATE_WINDOW_SECONDS,
      )
    ) {
      return refreshError("rate-limited", 429);
    }
  }

  const now = new Date();
  const snapshot = await loadTodayEventSnapshot(now).catch((error: unknown) => {
    // Diagnostics stay in the server log. The response below is rebuilt from
    // an allowlisted reason code and never serializes this Error object.
    logEventArchiveFailure("Today archive loader failed", error);
    return null;
  });
  const events = selectTodayEvents(snapshot?.publicEvents ?? EVENTS, now);
  const sourceHealth = publicEventArchiveSourceHealth(snapshot?.sourceHealth);
  const degraded = sourceHealth.degraded;

  return NextResponse.json(
    {
      events,
      partial: degraded,
      // Stable public codes keep a timeout distinguishable from stale data
      // without leaking an arbitrary database or driver message.
      issues: sourceHealth.issues,
      unavailable: sourceHealth.unavailable,
    },
    {
      headers: {
        // A healthy snapshot is safe to share briefly. A fallback is not: one
        // cold read must never teach the CDN that Frederick has no events.
        "Cache-Control": degraded || bypassCache ? DEGRADED_CACHE : HEALTHY_CACHE,
      },
    },
  );
}
