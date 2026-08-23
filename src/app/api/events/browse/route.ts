import { NextResponse } from "next/server";
import {
  logEventArchiveFailure,
  loadEventArchiveSnapshot,
  publicEventArchiveSourceHealth,
} from "@/lib/loaders/todayEventSnapshot";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import { prepareEventsForBrowse } from "@/lib/events/browsePayload";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import { isPublicEvent } from "@/lib/events/classify";
import { allUpcoming } from "@/lib/loaders/events";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";

// This endpoint must read the runtime archive. Static generation runs with no
// promoted-data database and can otherwise publish the curated fallback as if
// it were the complete event board.
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

/**
 * Deferred continuation for the /events board.
 *
 * The static page ships only its server-rendered horizon previews. A person
 * asks for this complete compact collection by filtering, expanding, sorting,
 * searching, or changing view. The underlying unified feed and this response
 * share the page's five-minute cache horizon.
 */
export async function GET(request: Request) {
  const bypassCache = new URL(request.url).searchParams.get("refresh") === "1";
  if (bypassCache) {
    // The normal endpoint is public and edge-cached. Only the explicit
    // recovery read bypasses that protection, so guard that button-shaped
    // escape hatch before it can start another archive load.
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
  const snapshot = await loadEventArchiveSnapshot(now).catch((error: unknown) => {
    // Keep the board usable and the diagnostic server-side. Public health is
    // reconstructed from stable allowlisted codes below.
    logEventArchiveFailure("Browse archive loader failed", error);
    return null;
  });
  const publicEvents =
    snapshot?.publicEvents ?? allUpcoming(now).filter(isPublicEvent);
  const sourceHealth = publicEventArchiveSourceHealth(snapshot?.sourceHealth);
  const liveSlugs = publicEvents
    .filter((event) => isEventLiveNow(event, now))
    .map((event) => event.slug);
  const bounds = buildHorizonBounds(now, new Set(liveSlugs));
  const events = prepareEventsForBrowse(publicEvents, bounds);

  return NextResponse.json(
    { events, liveSlugs, generatedAt: now.toISOString(), sourceHealth },
    {
      headers: {
        // Keep normal reads inexpensive, but never preserve a degraded
        // archive answer. Explicit refreshes also remain private so the
        // recovery check cannot create another stale shared response.
        "Cache-Control": sourceHealth.degraded || bypassCache
          ? DEGRADED_CACHE
          : HEALTHY_CACHE,
      },
    },
  );
}
