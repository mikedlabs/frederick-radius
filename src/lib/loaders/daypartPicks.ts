import "server-only";
import { likelyOpenPlaces, rankPlaces } from "@/lib/loaders/places";
import { formatHoursLine, isOpenNow } from "@/lib/hours";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { daypartNeeds } from "@/lib/today/daypart-needs";
import type { WeatherLean } from "@/lib/today/weatherLean";
import { isRecommendable } from "@/lib/relevance";
import {
  chainBrandKey,
  coffeeIntentTier,
  isChainName,
} from "@/lib/category-ranking";

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

function keepOneLocationPerChain<T extends { name: string }>(places: T[]): T[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    const brand = chainBrandKey(place.name);
    if (!brand) return true;
    if (seen.has(brand)) return false;
    seen.add(brand);
    return true;
  });
}

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
      // Preserve the loader's quality order inside each relevance/locality
      // bucket. Generic Coffee should start with independent coffee shops and
      // roasters, then chains and cafés; a boba or incidental-coffee record
      // remains in the inventory but cannot lead on feature score alone.
      const intentRanked = need.category === "coffee"
        ? [...eligible].sort(
            (a, b) =>
              coffeeIntentTier(b) - coffeeIntentTier(a) ||
              Number(isChainName(a.name)) - Number(isChainName(b.name)),
          )
        : eligible;
      const confirmed = intentRanked.filter((place) => isOpenNow(place.open_status));
      const confidence = confirmed.length > 0 ? "confirmed" : "likely";
      const available = confirmed.length > 0
        ? confirmed
        : intentRanked.filter((place) => likelySlugs.has(place.slug));
      const picks = need.category === "coffee"
        ? keepOneLocationPerChain(available)
        : available;

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
        // The closing time, not the fact that it is open. `isOpenNow` already
        // ran on this exact object nine lines up to build `confirmed`, and
        // formatHoursLine turns the same open_status into "Open until 9pm" or
        // "Closing soon · 10pm". Leaving this null made DaypartNeeds fall back
        // to the literal string "Open now" on all four tiles, so the one
        // location-aware answer on Today opened by saying the same two words
        // four times while the closing time sat in hand.
        //
        // These strings are deliberately the ones /api/want substitutes on its
        // live refresh (want-answer.ts toRow), so the first paint now matches
        // what replaces it instead of visibly changing a moment later.
        fact:
          confidence === "likely"
            ? "Likely open · check hours"
            : formatHoursLine(place.open_status),
        confidence,
      }));
    })(),
  }));
}
