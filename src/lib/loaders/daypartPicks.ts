import "server-only";
import { rankPlaces } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { daypartNeeds } from "@/lib/today/daypart-needs";
import type { WeatherLean } from "@/lib/today/weatherLean";
import { suppressedDaypartCategories } from "@/lib/today/craving-lead";
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
};
export type DaypartRow = { label: string; href: string; category: string; picks: DaypartPick[] };

function easternHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now),
  );
}

export function buildDaypartRows(now: Date, lean: WeatherLean = null): DaypartRow[] {
  // De-dupe against the CravingStrip "I want…" lead above: if CravingStrip is
  // already visibly leading with this daypart's meal (Eat → the "Dinner"/"Lunch"
  // restaurant rail) or drinks (the brewery/bar rails), drop that one rail so the
  // page never says "dinner" twice back-to-back. Never let the de-dupe empty the
  // section: if it would remove every rail, keep the full set.
  const suppressed = suppressedDaypartCategories(now);
  const allNeeds = daypartNeeds(easternHour(now), lean);
  const kept = allNeeds.filter((need) => !suppressed.has(need.category));
  const needs = kept.length > 0 ? kept : allNeeds;
  // The initial HTML is an honest COUNTY-WIDE quality ranking. It must not use
  // downtown Frederick as a silent stand-in for the visitor's location: that
  // made a five-mile-away place look "around here." DaypartNeeds immediately
  // refreshes the active shelf through /api/want, which honors the shared town
  // scope or a cached device fix and then prints that context in the UI.
  const ranked = rankPlaces({ now, preferOpen: true, limit: 500 });
  return needs.map((need) => ({
    label: need.label,
    href: need.href,
    category: need.category,
    picks: ranked
      .filter(
        (p) =>
          p.category === need.category &&
          isOpenNow(p.open_status) &&
          isRecommendable(p),
      )
      .slice(0, 4)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        rating: p.google_rating ?? null,
        photo: p.google_photo_url ?? null,
        photoCredit: p.google_photo_attribution?.authors[0]?.display_name ?? null,
        where:
          p.city?.trim() ||
          MUNICIPALITY_BY_SLUG[p.municipality]?.name ||
          "Frederick County",
        distance: null,
        fact: null,
      })),
  }));
}
