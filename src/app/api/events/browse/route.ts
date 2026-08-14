import { NextResponse } from "next/server";
import { loadEventArchiveSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import { prepareEventsForBrowse } from "@/lib/events/browsePayload";
import { isEventLiveNow } from "@/lib/eventWhenLabel";

// Builds run in promoted-data mode with database access deliberately disabled.
// This route must execute at request time or Next will bake that build fallback
// into production for five minutes. The explicit response headers below still
// let the CDN coalesce healthy runtime reads.
export const dynamic = "force-dynamic";

const CURRENT_CACHE = "public, s-maxage=300, stale-while-revalidate=900";
const DEGRADED_CACHE = "private, no-store, max-age=0";

function archiveReadIsCacheable(
  state: string | undefined,
): boolean {
  return state === "current" || state === "provider_partial";
}

/**
 * Deferred continuation for the /events board.
 *
 * The static page ships only its server-rendered horizon previews. A person
 * asks for this complete compact collection by filtering, expanding, sorting,
 * searching, or changing view. The underlying unified feed and this response
 * share the page's five-minute cache horizon.
 */
export async function GET() {
  const now = new Date();
  const { publicEvents, sourceHealth } = await loadEventArchiveSnapshot(now);
  const liveSlugs = publicEvents
    .filter((event) => isEventLiveNow(event, now))
    .map((event) => event.slug);
  const bounds = buildHorizonBounds(now, new Set(liveSlugs));
  const events = prepareEventsForBrowse(publicEvents, bounds);
  const cacheable = archiveReadIsCacheable(sourceHealth.archive?.state);
  const coverage = sourceHealth.degraded ? "partial" : "complete";

  return NextResponse.json(
    { events, liveSlugs, generatedAt: now.toISOString(), sourceHealth },
    {
      headers: {
        // A timeout still returns useful curated rows, but it must never
        // replace a healthy shared response with the tiny fallback for five
        // minutes. Provider-only partial archives remain cacheable because the
        // durable last-known-good rows are still readable.
        "Cache-Control": cacheable ? CURRENT_CACHE : DEGRADED_CACHE,
        "X-Radius-Source-Coverage": coverage,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
