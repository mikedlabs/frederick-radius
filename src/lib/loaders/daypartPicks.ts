import "server-only";
import { rankPlaces } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import { FREDERICK_CENTER } from "@/lib/geo";
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
  // One ranked, open-preferring pass over the catalog; each need filters it.
  const ranked = rankPlaces({ origin: FREDERICK_CENTER, now, preferOpen: true, limit: 500 });
  return needs
    .map((need) => ({
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
        })),
    }))
    .filter((row) => row.picks.length > 0);
}
