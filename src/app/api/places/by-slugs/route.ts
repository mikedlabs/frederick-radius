import { NextResponse } from "next/server";
import {
  normalizeRequestedPlaceSlugs,
  resolvePlacesBySlugs,
} from "@/lib/loaders/placesBySlugs";
import { loadLivePlaceEvidence } from "@/lib/loaders/livePlaceEvidence";
import { applyLivePlaceEvidenceMap } from "@/lib/live-place-evidence";

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
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("slugs") ?? "";
  const slugs = normalizeRequestedPlaceSlugs(raw);

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

  const snapshotPlaces = resolvePlacesBySlugs(slugs);
  const evidence = await loadLivePlaceEvidence(
    snapshotPlaces.map((place) => place.slug),
  );
  const places = applyLivePlaceEvidenceMap(snapshotPlaces, evidence);

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
