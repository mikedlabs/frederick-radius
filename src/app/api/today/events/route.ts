import { NextResponse } from "next/server";
import { loadTodayEventSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { EVENTS } from "@/data/events";
import { selectTodayEvents } from "@/lib/today-events";

export const revalidate = 300;
// Do not publish the promoted-build fallback as this endpoint's first cached
// answer. During application compilation the database is intentionally off,
// so a prerendered response says `event archive (no database)` even though the
// production runtime archive is healthy. This route is the client recovery
// path for a Today ISR miss and must execute at runtime; its explicit CDN
// cache header below still collapses repeat reads for five minutes.
export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const snapshot = await loadTodayEventSnapshot(now).catch(() => null);
  const events = selectTodayEvents(snapshot?.publicEvents ?? EVENTS, now);
  const partial = !snapshot || snapshot.sourceHealth.degraded;

  return NextResponse.json(
    {
      events,
      partial,
      // WHY the archive was not used, when it was not used. The loader already
      // names its fallback ("no database", "read timeout", "last run failed",
      // "stale", "validation") but the API threw that away, so a production
      // outage where /today serves the build-time seeds instead of ~390 live
      // archive rows looked identical from outside whether the cause was a
      // slow read, a permissions denial, or an unusable archive. Diagnosing it
      // from the code alone cost hours and produced two wrong answers; the
      // reader knows, so it should say. Empty when the archive was used.
      unavailable: snapshot ? snapshot.sourceHealth.unavailable : ["loader threw"],
    },
    {
      headers: {
        "Cache-Control": partial
          ? "private, no-store, max-age=0"
          : "public, s-maxage=300, stale-while-revalidate=900",
      },
    },
  );
}
