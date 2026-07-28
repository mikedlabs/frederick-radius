import "server-only";
import { likelyOpenPlaces, rankPlaces } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { daypartNeeds } from "@/lib/today/daypart-needs";
import type { WeatherLean } from "@/lib/today/weatherLean";
import { isRecommendable } from "@/lib/relevance";

/**
 * Server loader for /today's "Right now, around here" section: the daypart's
 * most-wanted place needs, each filled with the top OPEN-NOW places of its
 * category. Kept out of the component (the eslint bundle guard blocks a value
 * import of loaders/places from components/), so DaypartNeeds stays a pure
 * presentational server component taking these rows as props.
 */

export type DaypartPick = {
  slug: string;
  name: string;
  rating: number | null;
  photo?: string | null;
  photoCredit?: string | null;
  /** Always identify the town when the server is showing countywide picks. */
  where?: string | null;
  /** Filled by the live, context-aware /api/want refresh in DaypartNeeds. */
  distance?: string | null;
  /** Live hours line such as "Open until 9pm". */
  fact?: string | null;
  /** Whether the hours signal is live-confirmed or a conservative posted-hours fallback. */
  confidence: "confirmed" | "likely";
};
export type DaypartRow = { label: string; href: string; category: string; picks: DaypartPick[] };

function easternHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now),
  );
}

export function buildDaypartRows(now: Date, lean: WeatherLean = null): DaypartRow[] {
  // The category browser above is collapsed by default. Keep the current meal
  // visible here instead of treating content behind that disclosure as a
  // duplicate. A lunch or dinner answer should never require a discovery tap.
  const needs = daypartNeeds(easternHour(now), lean);
  // The initial HTML is an honest COUNTY-WIDE quality ranking. It must not use
  // downtown Frederick as a silent stand-in for the visitor's location: that
  // made a five-mile-away place look "around here." DaypartNeeds immediately
  // refreshes the active shelf through /api/want, which honors the shared town
  // scope or a cached device fix and then prints that context in the UI.
  const ranked = rankPlaces({ now, preferOpen: true, limit: 500 });
  const likelySlugs = new Set(
    likelyOpenPlaces(undefined, now).map((place) => place.slug),
  );
  return needs.map((need) => ({
    label: need.label,
    href: need.href,
    category: need.category,
    picks: (() => {
      const eligible = ranked.filter(
        (place) =>
          place.category === need.category &&
          isRecommendable(place),
      );
      const confirmed = eligible.filter((place) => isOpenNow(place.open_status));
      const confidence = confirmed.length > 0 ? "confirmed" : "likely";
      const picks = confirmed.length > 0
        ? confirmed
        : eligible.filter((place) => likelySlugs.has(place.slug));

      return picks.slice(0, 4).map((place) => ({
        slug: place.slug,
        name: place.name,
        rating: place.google_rating ?? null,
        photo: place.google_photo_url ?? null,
        photoCredit:
          place.google_photo_attribution?.authors[0]?.display_name ?? null,
        where:
          place.city?.trim() ||
          MUNICIPALITY_BY_SLUG[place.municipality]?.name ||
          "Frederick County",
        distance: null,
        fact: confidence === "likely" ? "Likely open" : null,
        confidence,
      }));
    })(),
  }));
}
