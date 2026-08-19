import { NextResponse } from "next/server";
import { loadTodayEventSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { EVENTS } from "@/data/events";
import { selectTodayEvents } from "@/lib/today-events";

export const revalidate = 300;

export async function GET() {
  const now = new Date();
  const snapshot = await loadTodayEventSnapshot(now).catch(() => null);
  const events = selectTodayEvents(snapshot?.publicEvents ?? EVENTS, now);

  return NextResponse.json(
    {
      events,
      partial: !snapshot || snapshot.sourceHealth.degraded,
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
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}
