import type { Metadata } from "next";
import MockShowcase from "@/components/mock/MockShowcase";
import { publicPlacesByMunicipality, decoratePlace, type PlaceCardData } from "@/lib/loaders/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PHOTOGENIC_CATEGORIES } from "@/lib/photogenic";
import { nearestAerial, currentSeason } from "@/lib/aerial";
import { isOpenNow } from "@/lib/hours";

/**
 * /mock — PREMIUM redesign mockups. A look-and-feel showcase (home +
 * place detail + discover) in the elevated design language, built on
 * real Frederick photos + data so the premium direction can be judged
 * on actual screens before any global tokens change. Outside (app) so
 * it's full-bleed; noindex; not linked anywhere.
 */
export const metadata: Metadata = {
  title: "Premium mockups",
  robots: { index: false, follow: false },
};
export const revalidate = 600;

function pick(p: PlaceCardData) {
  return {
    slug: p.slug,
    name: p.name,
    category: CATEGORY_BY_SLUG[p.category]?.name ?? p.category,
    color: CATEGORY_BY_SLUG[p.category]?.color ?? "#A03A22",
    photo: p.google_photo_url as string,
    blurb: p.short_blurb ?? "",
    rating: typeof p.google_rating === "number" ? p.google_rating : null,
    reviews: typeof p.google_rating_count === "number" ? p.google_rating_count : null,
    open: isOpenNow(p.open_status),
  };
}

export default function MockPage() {
  const fred = MUNICIPALITY_BY_SLUG["frederick"];
  const ranked = publicPlacesByMunicipality("frederick")
    .map((p) => decoratePlace(p, fred?.centroid))
    .filter((p) => p.google_photo_url && PHOTOGENIC_CATEGORIES.has(p.category))
    .sort((a, b) => b.feature_score - a.feature_score);

  const heroRaw = ranked.find((p) => p.google_rating && p.short_blurb) ?? ranked[0];
  const hero = pick(heroRaw);
  const cards = ranked.filter((p) => p.slug !== heroRaw.slug).slice(0, 6).map(pick);
  const aerial = nearestAerial(fred?.centroid ?? { lng: -77.41, lat: 39.41 }, {
    maxMeters: 4000,
    preferSeason: currentSeason(),
  });

  return (
    <MockShowcase
      hero={hero}
      cards={cards}
      aerialSrc={aerial?.src ?? hero.photo}
      season={currentSeason()}
    />
  );
}
