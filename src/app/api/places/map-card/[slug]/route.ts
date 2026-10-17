import { NextResponse } from "next/server";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { selectedPlacePhoto } from "@/lib/loaders/selectedPlacePhoto";
import { loadLivePlaceEvidence } from "@/lib/loaders/livePlaceEvidence";
import { applyLivePlaceEvidence } from "@/lib/live-place-evidence";

/**
 * Small, on-demand payload for the selected map card.
 *
 * The browse map deliberately ships pin-only place records. Sending one photo
 * URL and address for all ~1,600 places would add hundreds of kilobytes to the
 * first load, while calling Google on every pin tap would be needlessly
 * expensive. This route reads the reviewed, prebuilt place snapshot instead
 * of loading the multi-megabyte enrichment source on every cold function, then
 * returns only the few fields the compact card can show.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const snapshotPlace = clientPlaceBySlug(slug);
  if (!snapshotPlace) {
    return NextResponse.json(
      { place: null },
      { status: 404, headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
  const evidence = await loadLivePlaceEvidence([slug]);
  const place = applyLivePlaceEvidence(
    snapshotPlace,
    evidence.get(snapshotPlace.slug),
  );
  const photo = selectedPlacePhoto(slug, place);

  return NextResponse.json(
    {
      place: {
        slug: place.slug,
        address: place.address,
        city: place.city,
        state: place.state,
        postal_code: place.postal_code,
        google_photo_url: photo?.url,
        // Google photos stay behind the reviewed URL + attribution pair above.
        // `hero_image` is reserved for owned or separately licensed imagery.
        hero_image: place.hero_image,
        google_photo_attribution: photo?.attribution,
        google_maps_uri:
          place.google_maps_uri ?? photo?.attribution.google_maps_uri,
        open_status: place.open_status,
        hours_updated_at: place.hours_updated_at,
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
