import "server-only";

import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import type { LngLat } from "@/lib/geo";
import {
  getMapboxTravelMatrix,
  type MapboxMatrixLeg,
} from "@/lib/integrations/mapboxMatrix";
import type { WantAnswer, WantRow } from "@/lib/want-answer";

type PlaceCoordinate = {
  slug: string;
  geom?: LngLat;
};

const COORDINATE_BY_SLUG = new Map(
  (CLIENT_RAW as PlaceCoordinate[])
    .filter(
      (place): place is PlaceCoordinate & { geom: LngLat } =>
        typeof place.geom?.lng === "number" &&
        typeof place.geom?.lat === "number",
    )
    .map((place) => [place.slug, place.geom] as const),
);

type TravelLookup = Map<
  string,
  {
    leg: MapboxMatrixLeg;
    originalIndex: number;
  }
>;

function answerRows(answer: WantAnswer): WantRow[] {
  return [
    ...(answer.hero ? [answer.hero] : []),
    ...answer.also,
    ...(answer.open ?? []),
    ...answer.notable,
    ...answer.later,
  ];
}

function compactWalkingLabel(minutes: number): string {
  return `${minutes} min walk`;
}

function withTravel(row: WantRow, lookup: TravelLookup): WantRow {
  const match = lookup.get(row.slug);
  const minutes = match?.leg.minutes;
  if (!match || minutes == null) return row;
  return {
    ...row,
    distance: compactWalkingLabel(minutes),
    travel: {
      mode: "walking",
      minutes,
      distanceMeters: match.leg.distanceMeters,
    },
  };
}

/**
 * A route-time comparison should refine Radius's editorial shortlist, not
 * replace it. Open-now answers are already proximity-led, so routed duration
 * sorts them directly. Best-fit answers retain their editorial order within
 * a three-minute band, but a materially closer result moves ahead.
 */
function rerank(
  rows: WantRow[],
  lookup: TravelLookup,
  mode: WantAnswer["rankingMode"],
): WantRow[] {
  const candidates = rows.map((row, originalIndex) => ({
    row: withTravel(row, lookup),
    originalIndex,
    seconds: lookup.get(row.slug)?.leg.durationSeconds ?? null,
  }));

  if (mode !== "best-fit") {
    return candidates
      .sort((a, b) => {
        if (a.seconds == null && b.seconds == null) {
          return a.originalIndex - b.originalIndex;
        }
        if (a.seconds == null) return 1;
        if (b.seconds == null) return -1;
        return a.seconds - b.seconds || a.originalIndex - b.originalIndex;
      })
      .map(({ row }) => row);
  }

  // Preserve editorial order unless a later pick is genuinely more than
  // three minutes closer. Inserting against the actual time delta avoids the
  // old clock-bucket edge case where 2:59 and 3:01 could swap despite being
  // only two seconds apart.
  const ranked: typeof candidates = [];
  for (const candidate of candidates.filter((item) => item.seconds != null)) {
    const insertAt = ranked.findIndex(
      (current) =>
        current.seconds != null &&
        candidate.seconds! + 180 < current.seconds,
    );
    if (insertAt === -1) ranked.push(candidate);
    else ranked.splice(insertAt, 0, candidate);
  }
  ranked.push(...candidates.filter((item) => item.seconds == null));
  return ranked.map(({ row }) => row);
}

/**
 * Add real walking times to the small answer Radius has already vetted.
 *
 * This is intentionally server-only, one origin to at most nine unique
 * destinations, and fail-soft. If Mapbox is disabled, slow, or cannot route a
 * point, callers receive the original haversine-ranked answer unchanged.
 */
export async function enrichWantAnswerWithWalkingTimes(
  answer: WantAnswer,
  origin: LngLat,
  options: { timeoutMs?: number } = {},
): Promise<WantAnswer> {
  const uniqueRows: WantRow[] = [];
  const seen = new Set<string>();
  for (const row of answerRows(answer)) {
    if (seen.has(row.slug) || !COORDINATE_BY_SLUG.has(row.slug)) continue;
    seen.add(row.slug);
    uniqueRows.push(row);
    if (uniqueRows.length === 9) break;
  }
  if (uniqueRows.length < 2) return answer;

  const result = await getMapboxTravelMatrix({
    profile: "walking",
    origin,
    destinations: uniqueRows.map((row) => COORDINATE_BY_SLUG.get(row.slug)!),
  }, options);
  if (!result.ok) return answer;

  const lookup: TravelLookup = new Map();
  for (const leg of result.legs) {
    const row = uniqueRows[leg.destinationIndex];
    if (row) lookup.set(row.slug, { leg, originalIndex: leg.destinationIndex });
  }

  const current = rerank(
    [...(answer.hero ? [answer.hero] : []), ...answer.also],
    lookup,
    answer.rankingMode,
  );

  return {
    ...answer,
    hero: current[0] ?? null,
    also: current.slice(1),
    open: answer.open
      ? rerank(answer.open, lookup, answer.rankingMode)
      : undefined,
    notable: rerank(answer.notable, lookup, "best-fit"),
    // Opening time is the useful order in this lane. Add the route evidence
    // without making a farther place that opens at 7 outrank one opening at 6.
    later: answer.later.map((row) => withTravel(row, lookup)),
  };
}
