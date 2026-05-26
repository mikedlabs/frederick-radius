import { NextResponse } from "next/server";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * GET /api/places/by-slugs?slugs=a,b,c
 *
 * Returns the slim PlaceCardData for each known slug. Unknown slugs
 * are quietly dropped (the client filters them anyway). Used by:
 *   - SavedList — to hydrate the user's saved bookmarks + recently
 *     viewed slugs + the empty-state seeds.
 *
 * The whole point is to keep the ~2MB places-client.json off the
 * client bundle for routes that mount these components. The data is
 * already in memory on the server, so this is a cheap dictionary
 * lookup; the slow part is the JSON serialization of the response,
 * which the edge cache mostly amortizes.
 *
 * Limits:
 *   - Max 100 slugs per request (the longest plausible Saved list)
 *   - Each slug capped at 120 chars (no crazy inputs)
 *
 * Caching: a user's saved list is per-device, but the slug→Place map
 * is global. A short s-maxage lets the edge collapse repeated requests
 * for the same slug-set across users (rare in practice but cheap).
 */
const MAX_SLUGS = 100;
const MAX_SLUG_LEN = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("slugs") ?? "";
  const slugs = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= MAX_SLUG_LEN)
    .slice(0, MAX_SLUGS);

  if (slugs.length === 0) {
    return NextResponse.json(
      { places: [] },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  }

  const places: PlaceCardData[] = [];
  // Dedupe: a buggy client could send the same slug twice. The map
  // already dedupes on the consumer side, but we don't want to pay
  // the cost twice.
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const p = clientPlaceBySlug(slug);
    if (p) places.push(p);
  }

  return NextResponse.json(
    { places },
    {
      headers: {
        // Short s-maxage so a regenerated places-client.json
        // (npm run build:client-places) shows up quickly. SWR keeps
        // repeat queries fast while the edge revalidates.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
