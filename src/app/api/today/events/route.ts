import { NextResponse } from "next/server";
import { loadTodayEventSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { EVENTS } from "@/data/events";
import { selectTodayEvents } from "@/lib/today-events";

// Builds run without the runtime database, so this archive-backed endpoint
// must never be prerendered. Healthy request-time results remain CDN-cacheable
// through the explicit response header below.
export const dynamic = "force-dynamic";

const CURRENT_CACHE = "public, s-maxage=300, stale-while-revalidate=900";
const DEGRADED_CACHE = "private, no-store, max-age=0";

function archiveReadIsCacheable(
  state: string | undefined,
): boolean {
  return state === "current" || state === "provider_partial";
}

export async function GET() {
  const now = new Date();
  const snapshot = await loadTodayEventSnapshot(now).catch(() => null);
  const events = selectTodayEvents(snapshot?.publicEvents ?? EVENTS, now);
  const cacheable = archiveReadIsCacheable(snapshot?.sourceHealth.archive?.state);
  const coverage = snapshot && !snapshot.sourceHealth.degraded
    ? "complete"
    : "partial";

  return NextResponse.json(
    { events, partial: !snapshot || snapshot.sourceHealth.degraded },
    {
      headers: {
        // Do not cache a transient database timeout as Today's shared truth.
        // The curated fallback remains usable for this request only.
        "Cache-Control": cacheable ? CURRENT_CACHE : DEGRADED_CACHE,
        "X-Radius-Source-Coverage": coverage,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
