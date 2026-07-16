import { NextResponse } from "next/server";
import { eventsLive } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import { prepareEventsForBrowse } from "@/lib/events/browsePayload";

export const revalidate = 300;

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
  const liveSlugs = eventsLive(now).map((event) => event.slug);
  const { publicEvents, sourceHealth } = await assembleUnifiedEvents(now);
  const bounds = buildHorizonBounds(now, new Set(liveSlugs));
  const events = prepareEventsForBrowse(publicEvents, bounds);

  return NextResponse.json(
    { events, liveSlugs, generatedAt: now.toISOString(), sourceHealth },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    },
  );
}
