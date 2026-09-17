import "server-only";
import { likelyOpenPlaces, rankPlaces } from "@/lib/loaders/places";
import { formatHoursLine, formatTime, isOpenNow } from "@/lib/hours";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import {
  openingSoonFromStatus,
  reliableOpeningSoon,
} from "@/data/reliable-open-windows";
import { daypartNeeds } from "@/lib/today/daypart-needs";
import { easternParts } from "@/lib/tz";
import type { WeatherLean } from "@/lib/today/weatherLean";
import { isRecommendable } from "@/lib/relevance";
import { mayUseLikelyOpenFallback } from "@/lib/likely-open";
import {
  keepOneLocationPerChain,
  coffeeIntentTier,
  isChainName,
} from "@/lib/category-ranking";
import type { DecisionReason } from "@/lib/decision/core";

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
  /** The same evidence-backed explanation used by Ask and Nearby. */
  decisionReasons?: DecisionReason[];
  /** How strong the hours signal is. "confirmed" = posted hours say open now;
   *  "likely" = a conservative posted-hours fallback; "unconfirmed" = the
   *  county's hours cannot answer for this place at all, so the row is offered
   *  as a real candidate without an open claim. */
  confidence: "confirmed" | "likely" | "unconfirmed";
};
export type DaypartRow = {
  label: string;
  href: string;
  category: string;
  picks: DaypartPick[];
  /** One near-term transition, kept outside the open-now list so a closed
   * place can never inherit an open label from the shelf. */
  openingSoon?: DaypartPick | null;
};



export function buildDaypartRows(now: Date, lean: WeatherLean = null): DaypartRow[] {
  // The category browser above is collapsed by default. Keep the current meal
  // visible here instead of treating content behind that disclosure as a
  // duplicate. A lunch or dinner answer should never require a discovery tap.
  const parts = easternParts(now);
  const needs = daypartNeeds(parts.hour, lean, parts.weekday);
  // The initial HTML is an honest COUNTY-WIDE quality ranking. It must not use
  // downtown Frederick as a silent stand-in for the visitor's location: that
  // made a five-mile-away place look "around here." DaypartNeeds immediately
  // refreshes the active shelf through /api/want, which honors the shared town
  // scope or a cached device fix and then prints that context in the UI.
  // Keep verified-closed candidates long enough to identify a useful same-day
  // opening transition. The current-place lanes below explicitly admit only
  // confirmed-open or unknown/unverified candidates, so this does not weaken
  // the open-now gate.
  const ranked = rankPlaces({ now, limit: 500 });
  const likelySlugs = new Set(
    likelyOpenPlaces(undefined, now).map((place) => place.slug),
  );
  return needs.map((need) => {
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

    const confirmedSoon = intentRanked
      .map((place, index) => {
        const timing = openingSoonFromStatus(place.open_status, now);
        return timing ? { place, index, ...timing } : null;
      })
      .filter((match): match is NonNullable<typeof match> => Boolean(match))
      .sort(
        (a, b) =>
          a.minutesUntil - b.minutesUntil ||
          a.index - b.index,
      )[0];
    const likelySoon = confirmedSoon
      ? null
      : intentRanked
          .map((place, index) => {
            if (!mayUseLikelyOpenFallback(place.open_status)) return null;
            const timing = reliableOpeningSoon(place.slug, now);
            return timing ? { place, index, ...timing } : null;
          })
          .filter((match): match is NonNullable<typeof match> => Boolean(match))
          .sort(
            (a, b) =>
              a.minutesUntil - b.minutesUntil ||
              a.index - b.index,
          )[0] ?? null;
    const openingSoonMatch = confirmedSoon ?? likelySoon;
    const openingSoonConfidence: DaypartPick["confidence"] = confirmedSoon
      ? "confirmed"
      : "likely";

    const toPick = (
      place: (typeof intentRanked)[number],
      confidence: DaypartPick["confidence"],
      fact: string,
    ): DaypartPick => ({
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
      fact,
      confidence,
    });

    const openingSoon = openingSoonMatch
      ? toPick(
          openingSoonMatch.place,
          openingSoonConfidence,
          openingSoonConfidence === "confirmed"
            ? `Opens soon · ${formatTime(openingSoonMatch.opensAt)}`
            : `Likely opens at ${formatTime(openingSoonMatch.opensAt)} · check hours`,
        )
      : null;
    const openingSoonSlug = openingSoon?.slug;
    const confirmed = intentRanked.filter((place) => isOpenNow(place.open_status));
    const likely = confirmed.length > 0
      ? []
      : intentRanked.filter(
          (place) =>
            likelySlugs.has(place.slug) && place.slug !== openingSoonSlug,
        );
    // Third tier, added 2026-08-19. When the rolling hours refresh goes dark
    // county-wide, `confirmed` AND `likely` are both empty for every category.
    // Offer quality-ranked unknown-hour candidates, but never a place that
    // verified hours prove is closed. The opening-soon lane above owns the one
    // near-term closed exception and labels it explicitly.
    const unconfirmed = intentRanked.filter(
      (place) =>
        mayUseLikelyOpenFallback(place.open_status) &&
        place.slug !== openingSoonSlug,
    );
    const confidence: DaypartPick["confidence"] =
      confirmed.length > 0
        ? "confirmed"
        : likely.length > 0
          ? "likely"
          : "unconfirmed";
    const available = confirmed.length > 0
      ? confirmed
      : likely.length > 0
        ? likely
        : unconfirmed;
    const picks = need.category === "coffee"
      ? keepOneLocationPerChain(available)
      : available;

    return {
      label: need.label,
      href: need.href,
      category: need.category,
      openingSoon,
      picks: picks.slice(0, 4).map((place) =>
        toPick(
          place,
          confidence,
          confidence === "likely"
            ? "Likely open · check hours"
            : formatHoursLine(place.open_status),
        ),
      ),
    };
  });
}
