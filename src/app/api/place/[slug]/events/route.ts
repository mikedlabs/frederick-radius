import { NextResponse } from "next/server";
import { eventsAtVenue } from "@/data/events";
import { eventDateBlock } from "@/lib/loaders/events";

/**
 * Upcoming events happening AT a given venue, for the place sheet's
 * "Upcoming here" section. A cheap in-memory filter over the events set
 * (no external call), kept dynamic so `now` is always the real moment.
 *
 *   GET /api/place/<slug>/events  →  { events: [{ slug, title, weekday, day, month, time }] }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const now = Date.now();
  const events = eventsAtVenue(slug)
    .filter((e) => {
      // Upcoming, plus anything that started within the last 3h (still on).
      const t = Date.parse(e.starts_at);
      return Number.isFinite(t) && t >= now - 3 * 3_600_000;
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, 6)
    .map((e) => {
      const d = eventDateBlock(e);
      return { slug: e.slug, title: e.title, weekday: d.weekday, day: d.day, month: d.month, time: d.time };
    });
  return NextResponse.json({ events });
}
