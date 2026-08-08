import { NextResponse } from "next/server";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import PHOTO_CREDITS_RAW from "@/data/event-venue-photo-credits.json" with { type: "json" };
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import { googlePhotoNameFromProxyUrl } from "@/lib/google-photo-policy";

type CompactPhotoCredit = Omit<GooglePhotoAttribution, "photo_name">;
const PHOTO_CREDITS = PHOTO_CREDITS_RAW as unknown as Record<
  string,
  CompactPhotoCredit | undefined
>;

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
  const place = clientPlaceBySlug(slug);
  if (!place) {
    return NextResponse.json(
      { place: null },
      { status: 404, headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
  const compactPhotoCredit = PHOTO_CREDITS[slug];
  const photoName = place.google_photo_url
    ? googlePhotoNameFromProxyUrl(place.google_photo_url)
    : undefined;
  const photoAttribution = compactPhotoCredit && photoName
    ? { ...compactPhotoCredit, photo_name: photoName }
    : undefined;

  return NextResponse.json(
    {
      place: {
        slug: place.slug,
        address: place.address,
        city: place.city,
        state: place.state,
        postal_code: place.postal_code,
        google_photo_url: place.google_photo_url,
        // Google photos stay behind the reviewed URL + attribution pair above.
        // `hero_image` is reserved for owned or separately licensed imagery.
        hero_image: place.hero_image,
        google_photo_attribution:
          place.google_photo_attribution ?? photoAttribution,
        google_maps_uri:
          place.google_maps_uri ?? photoAttribution?.google_maps_uri,
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
