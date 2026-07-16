import { NextResponse } from "next/server";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isEventEnded, isEventToday } from "@/lib/eventWhenLabel";
import { isUtilityEvent } from "@/lib/event-kind";
import { compareForLead, isRoutineProgram } from "@/lib/events/lead-rank";

export const revalidate = 300;

function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export async function GET() {
  const now = new Date();
  const { publicEvents, sourceHealth } = await assembleUnifiedEvents(now);
  const events = publicEvents
    .filter((event) => isEventToday(event.starts_at, now) && !isEventEnded(event, now))
    .filter((event) => !isUtilityEvent(event) && !isRoutineProgram(event))
    .sort(compareForLead)
    .slice(0, 3)
    .map((event) => ({
      slug: event.slug,
      title: event.title,
      venue: event.venue_name,
      municipality: event.municipality,
      time: event.is_all_day ? "All day" : clock(event.starts_at),
      image: event.hero_image ?? null,
      free: event.is_free,
    }));

  return NextResponse.json(
    { events, partial: sourceHealth.degraded },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}
