import type { Metadata } from "next";
import FlyExperience from "@/components/fly/FlyExperience";
import { publicPlacesByMunicipality, decoratePlace } from "@/lib/loaders/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PHOTOGENIC_CATEGORIES } from "@/lib/photogenic";
import { currentSeason, highestAerial, nearestPerSeason } from "@/lib/aerial";
import { isOpenNow } from "@/lib/hours";

/**
 * /fly — "Fly Frederick" descent PROTOTYPE.
 *
 * A feel-test for the big idea: navigate the county the way it was shot —
 * from above, descending to what matters. Tap from the county view, the
 * camera flies down, the season aerial settles into downtown, the real
 * places bloom in, and tapping one morphs it into the place.
 *
 * Deliberately outside the (app) route group so it's full-bleed with no
 * nav chrome. Not linked anywhere; reach it at /fly. Real aerials, real
 * downtown places — only the pin POSITIONS are representative (a true
 * lat/lng→photo projection needs camera footprint we don't have).
 */
export const metadata: Metadata = {
  title: "Fly Frederick (prototype)",
  robots: { index: false, follow: false },
};
export const revalidate = 600;

export default async function FlyPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; open?: string; season?: string }>;
}) {
  // Prototype affordance: ?to=ground, ?open=<slug>, ?season=<s> deep-link
  // a stage/season so the end-states are directly loadable for review.
  const { to, open, season: seasonParam } = await searchParams;
  const fred = MUNICIPALITY_BY_SLUG["frederick"];
  const places = publicPlacesByMunicipality("frederick")
    .map((p) => decoratePlace(p, fred?.centroid))
    .filter((p) => p.google_photo_url && PHOTOGENIC_CATEGORIES.has(p.category))
    .sort((a, b) => b.feature_score - a.feature_score)
    .slice(0, 6)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: CATEGORY_BY_SLUG[p.category]?.name ?? p.category,
      photo: p.google_photo_url as string,
      color: CATEGORY_BY_SLUG[p.category]?.color ?? "#A8462C",
      open: isOpenNow(p.open_status),
    }));

  const season = currentSeason();
  const high = highestAerial();
  const center = fred?.centroid ?? { lng: high.lng, lat: high.lat };

  // The nearest downtown shot in EACH season — so the viewer can fly the
  // same place across the year. Each photo's season is its own (folder +
  // manifest), never the current-date guess.
  const per = nearestPerSeason(center);
  const ORDER = ["spring", "summer", "fall", "winter"] as const;
  const seasons = ORDER.filter((s) => per[s]).map((s) => ({
    key: s,
    src: per[s]!.src,
    altM: Math.round(per[s]!.altM ?? 0),
  }));
  const isSeason = (s?: string): s is (typeof ORDER)[number] =>
    !!s && (ORDER as readonly string[]).includes(s);
  const initialSeason =
    isSeason(seasonParam) && per[seasonParam]
      ? seasonParam
      : per[season]
        ? season
        : seasons[0]?.key ?? "summer";

  return (
    <FlyExperience
      highSrc={high.src}
      places={places}
      seasons={seasons}
      initialSeason={initialSeason}
      initialStage={to === "ground" ? "ground" : "sky"}
      initialOpenSlug={open ?? null}
    />
  );
}
