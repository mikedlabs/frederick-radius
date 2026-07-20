import "server-only";
import { rankPlaces } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import { FREDERICK_CENTER } from "@/lib/geo";
import { daypartNeeds } from "@/lib/today/daypart-needs";

/**
 * Server loader for /today's "Right now, around here" section: the daypart's
 * most-wanted place needs, each filled with the top OPEN-NOW places of its
 * category. Kept out of the component (the eslint bundle guard blocks a value
 * import of loaders/places from components/), so DaypartNeeds stays a pure
 * presentational server component taking these rows as props.
 */

export type DaypartPick = { slug: string; name: string; rating: number | null };
export type DaypartRow = { label: string; href: string; category: string; picks: DaypartPick[] };

function easternHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now),
  );
}

export function buildDaypartRows(now: Date): DaypartRow[] {
  const needs = daypartNeeds(easternHour(now));
  // One ranked, open-preferring pass over the catalog; each need filters it.
  const ranked = rankPlaces({ origin: FREDERICK_CENTER, now, preferOpen: true, limit: 500 });
  return needs
    .map((need) => ({
      label: need.label,
      href: need.href,
      category: need.category,
      picks: ranked
        .filter((p) => p.category === need.category && isOpenNow(p.open_status))
        .slice(0, 4)
        .map((p) => ({ slug: p.slug, name: p.name, rating: p.google_rating ?? null })),
    }))
    .filter((row) => row.picks.length > 0);
}
