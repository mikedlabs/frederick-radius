import type { Metadata } from "next";
import FlyExperience from "@/components/fly/FlyExperience";
import { publicPlacesByMunicipality, decoratePlace } from "@/lib/loaders/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PHOTOGENIC_CATEGORIES } from "@/lib/photogenic";
import { nearestAerial, currentSeason, highestAerial } from "@/lib/aerial";
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
  searchParams: Promise<{ to?: string; open?: string }>;
}) {
  // Prototype affordance: ?to=ground (and ?open=<slug>) deep-link a stage
  // so the descent/morph end-states are directly loadable for review.
  const { to, open } = await searchParams;
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
  const ground =
    nearestAerial(fred?.centroid ?? { lng: high.lng, lat: high.lat }, {
      maxMeters: 4000,
      preferSeason: season,
    }) ?? high;
  const groundMeta = `${season.charAt(0).toUpperCase()}${season.slice(1)} · ~${Math.round(ground.altM ?? 0)}m up`;

  return (
    <FlyExperience
      highSrc={high.src}
      groundSrc={ground.src}
      groundMeta={groundMeta}
      places={places}
      initialStage={to === "ground" ? "ground" : "sky"}
      initialOpenSlug={open ?? null}
    />
  );
}
