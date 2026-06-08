import type { Metadata } from "next";
import { publicPlaces, decoratePlace, type PlaceCardData } from "@/lib/loaders/places";
import { isCravingPlace } from "@/data/cravings";
import RightNow from "@/components/now/RightNow";

export const metadata: Metadata = {
  title: "Right now",
  description: "Tap what you want — coffee, ice cream, food — and get the nearest one that's open.",
};

// open_status is time-sensitive: a cached page would say "open" after close.
export const dynamic = "force-dynamic";

/**
 * /now — the one-tap craving answer.
 *
 * We decorate every public place (so open_status is computed for THIS
 * request), keep only the ones a craving can answer, and slim off the
 * heavy detail-only fields before shipping to the client. The client then
 * ranks "nearest open" against the user's live location. Filtering to
 * craving-eligible places keeps the SSR payload a fraction of the full
 * catalog.
 */
function slim(p: PlaceCardData): PlaceCardData {
  return {
    ...p,
    google_photos: [],
    description: undefined,
    review_snippet: undefined,
    review_author: undefined,
    google_hours: undefined,
    hours: undefined,
    amenities: undefined,
  };
}

export default async function NowPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const places = publicPlaces()
    .map((p) => decoratePlace(p))
    .filter((p) => isCravingPlace(p))
    .map(slim);

  return <RightNow places={places} initialCraving={c ?? null} />;
}
