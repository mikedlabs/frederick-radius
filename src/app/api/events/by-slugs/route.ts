import { NextResponse } from "next/server";
import {
  normalizeRequestedEventSlugs,
  resolveEventsBySlugs,
} from "@/lib/loaders/eventsBySlugs";

/**
 * GET /api/events/by-slugs?slugs=a,b,c
 *
 * Returns the renderable EventWithMeta for each known slug, in the order
 * requested. Unknown slugs are quietly dropped; the caller treats every
 * requested slug as answered so one stale save cannot pin Saved on a
 * skeleton. Used by:
 *   - SavedList — to hydrate the device's saved event slugs.
 *
 * This is the event sibling of /api/places/by-slugs and exists for the same
 * reason: the saved deck starts from slugs, and the only in-bundle event
 * index a client can hold is the ~30-row curated seed set. Every event saved
 * from a live feed carries a namespaced slug that seed set cannot contain.
 *
 * Limits: 100 slugs per request, 200 characters each (enforced in the
 * normalizer, before any snapshot or archive work).
 *
 * Caching: the saved set is per-device, but the slug→event map is global.
 * A short s-maxage lets the edge collapse repeats while keeping a cancelled
 * or rescheduled event from sitting in a saved deck for long — events move,
 * so this window is tighter than the place equivalent.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slugs = normalizeRequestedEventSlugs(url.searchParams.get("slugs") ?? "");

  if (slugs.length === 0) {
    return NextResponse.json(
      { events: [] },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  }

  const events = await resolveEventsBySlugs(slugs);

  return NextResponse.json(
    { events },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
