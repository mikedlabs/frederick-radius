import { eventGeoConfidence } from "@/lib/events/geo-confidence";
import { isHoursFresh } from "@/lib/hours-freshness";
import {
  HOURS_REFRESH_CYCLE_DAYS,
  HOURS_REFRESH_MIN_SUCCESS_RATIO,
  hoursRefreshCycleDay,
} from "@/lib/hours-refresh-targets";
import type { Amenity, AmenityKind } from "@/lib/loaders/amenities";

export type HoursRefreshArtifactEntry = {
  weekday_hours?: unknown;
  business_status?: string;
  refreshed_at?: string;
};

export type HoursRefreshArtifactSummary = {
  expectedGoogleBackedPlaces: number;
  rows: number;
  matchedRows: number;
  unmatchedRows: number;
  withSchedule: number;
  freshRefreshRows: number;
  freshRows: number;
  staleRows: number;
  invalidTimestamps: number;
  coveragePct: number;
  newestRefresh?: string;
  oldestRefresh?: string;
  cycle: HoursRefreshCycleSummary;
};

export type HoursRefreshCycleState =
  | "empty"
  | "warming"
  | "healthy"
  | "stalled";

export type HoursRefreshCycleBucket = {
  cycleDay: number;
  expected: number;
  refreshed: number;
  withSchedule: number;
  complete: boolean;
};

export type HoursRefreshCycleSummary = {
  days: number;
  state: HoursRefreshCycleState;
  completedDays: number;
  missingDays: number[];
  underfilledDays: number[];
  refreshCoveragePct: number;
  buckets: HoursRefreshCycleBucket[];
};

export function summarizeHoursRefreshArtifact(
  artifact: Readonly<Record<string, unknown>>,
  expectedGoogleBackedSlugs: ReadonlySet<string>,
  now = new Date(),
): HoursRefreshArtifactSummary {
  const rows = Object.entries(artifact).filter(
    ([slug, value]) =>
      !slug.startsWith("_") && Boolean(value && typeof value === "object"),
  ) as Array<[string, HoursRefreshArtifactEntry]>;
  const timestamps: string[] = [];
  let matchedRows = 0;
  let withSchedule = 0;
  let freshRefreshRows = 0;
  let freshRows = 0;
  let staleRows = 0;
  let invalidTimestamps = 0;
  const expectedByDay = Array.from(
    { length: HOURS_REFRESH_CYCLE_DAYS },
    () => 0,
  );
  const refreshedByDay = Array.from(
    { length: HOURS_REFRESH_CYCLE_DAYS },
    () => 0,
  );
  const schedulesByDay = Array.from(
    { length: HOURS_REFRESH_CYCLE_DAYS },
    () => 0,
  );

  for (const slug of expectedGoogleBackedSlugs) {
    expectedByDay[hoursRefreshCycleDay(slug)] += 1;
  }

  for (const [slug, row] of rows) {
    if (!expectedGoogleBackedSlugs.has(slug)) continue;
    matchedRows += 1;
    const hasSchedule =
      Array.isArray(row.weekday_hours) && row.weekday_hours.length > 0;
    if (hasSchedule) withSchedule += 1;
    const parsed = Date.parse(row.refreshed_at ?? "");
    if (!Number.isFinite(parsed)) {
      invalidTimestamps += 1;
      continue;
    }
    timestamps.push(new Date(parsed).toISOString());
    const fresh = isHoursFresh(row.refreshed_at, now);
    const cycleDay = hoursRefreshCycleDay(slug);
    if (fresh) {
      freshRefreshRows += 1;
      refreshedByDay[cycleDay] += 1;
      if (hasSchedule) {
        freshRows += 1;
        schedulesByDay[cycleDay] += 1;
      }
    } else if (hasSchedule) {
      staleRows += 1;
    }
  }

  timestamps.sort();
  const buckets = expectedByDay.map(
    (expected, cycleDay): HoursRefreshCycleBucket => {
      const refreshed = refreshedByDay[cycleDay];
      return {
        cycleDay,
        expected,
        refreshed,
        withSchedule: schedulesByDay[cycleDay],
        complete:
          expected === 0 ||
          refreshed / expected >= HOURS_REFRESH_MIN_SUCCESS_RATIO,
      };
    },
  );
  const missingDays = buckets
    .filter((bucket) => bucket.expected > 0 && bucket.refreshed === 0)
    .map((bucket) => bucket.cycleDay);
  const underfilledDays = buckets
    .filter(
      (bucket) =>
        bucket.expected > 0 &&
        bucket.refreshed > 0 &&
        !bucket.complete,
    )
    .map((bucket) => bucket.cycleDay);
  const completedDays = buckets.filter((bucket) => bucket.complete).length;
  const oldestRefresh = timestamps[0];
  const warmupWindowMs = (HOURS_REFRESH_CYCLE_DAYS - 1) * 86_400_000;
  const oldestRefreshMs = oldestRefresh
    ? Date.parse(oldestRefresh)
    : Number.NaN;
  let cycleState: HoursRefreshCycleState;
  if (matchedRows === 0 || timestamps.length === 0) {
    cycleState = "empty";
  } else if (freshRefreshRows === 0) {
    cycleState = "stalled";
  } else if (completedDays === HOURS_REFRESH_CYCLE_DAYS) {
    cycleState = "healthy";
  } else if (
    Number.isFinite(oldestRefreshMs) &&
    now.getTime() - oldestRefreshMs >= warmupWindowMs
  ) {
    cycleState = "stalled";
  } else {
    cycleState = "warming";
  }

  return {
    expectedGoogleBackedPlaces: expectedGoogleBackedSlugs.size,
    rows: rows.length,
    matchedRows,
    unmatchedRows: rows.length - matchedRows,
    withSchedule,
    freshRefreshRows,
    freshRows,
    staleRows,
    invalidTimestamps,
    coveragePct:
      expectedGoogleBackedSlugs.size === 0
        ? 0
        : Math.round(
            (freshRows / expectedGoogleBackedSlugs.size) * 1000,
          ) / 10,
    oldestRefresh,
    newestRefresh: timestamps.at(-1),
    cycle: {
      days: HOURS_REFRESH_CYCLE_DAYS,
      state: cycleState,
      completedDays,
      missingDays,
      underfilledDays,
      refreshCoveragePct:
        expectedGoogleBackedSlugs.size === 0
          ? 0
          : Math.round(
              (freshRefreshRows / expectedGoogleBackedSlugs.size) * 1000,
            ) / 10,
      buckets,
    },
  };
}

export type EventQualityInput = {
  slug: string;
  category?: string;
  venue_name?: string;
  venue_place_slug?: string;
  starts_at: string;
  ends_at: string;
  placement?: string;
  geom?: { lng: number; lat: number };
};

export type EventQualitySummary = {
  total: number;
  missingCategory: number;
  placeholderCategory: number;
  missingVenueName: number;
  unresolvedVenueJoin: number;
  areaCentroid: number;
  unknownLocation: number;
  invalidTime: number;
  zeroDuration: number;
  negativeDuration: number;
  categoryCounts: Readonly<Record<string, number>>;
};

const PLACEHOLDER_EVENT_CATEGORIES = new Set([
  "event",
  "general",
  "other",
  "unknown",
  "uncategorized",
]);

function validGeom(
  geom: EventQualityInput["geom"],
): geom is { lng: number; lat: number } {
  return Boolean(
    geom &&
      Number.isFinite(geom.lng) &&
      Number.isFinite(geom.lat),
  );
}

export function summarizeEventQuality(
  events: readonly EventQualityInput[],
): EventQualitySummary {
  const summary: EventQualitySummary = {
    total: events.length,
    missingCategory: 0,
    placeholderCategory: 0,
    missingVenueName: 0,
    unresolvedVenueJoin: 0,
    areaCentroid: 0,
    unknownLocation: 0,
    invalidTime: 0,
    zeroDuration: 0,
    negativeDuration: 0,
    categoryCounts: {},
  };
  const categoryCounts: Record<string, number> = {};

  for (const event of events) {
    const category = event.category?.trim().toLowerCase();
    if (!category) summary.missingCategory += 1;
    else {
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
      if (PLACEHOLDER_EVENT_CATEGORIES.has(category)) {
        summary.placeholderCategory += 1;
      }
    }

    if (!event.venue_name?.trim()) summary.missingVenueName += 1;
    if (!event.venue_place_slug?.trim()) summary.unresolvedVenueJoin += 1;

    if (!validGeom(event.geom)) {
      summary.unknownLocation += 1;
    } else {
      const confidence = eventGeoConfidence({
        placement: event.placement,
        geom: event.geom,
      });
      if (confidence === "area") summary.areaCentroid += 1;
      else if (confidence === "unknown") summary.unknownLocation += 1;
    }

    const startsAt = Date.parse(event.starts_at);
    const endsAt = Date.parse(event.ends_at);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
      summary.invalidTime += 1;
    } else if (endsAt === startsAt) {
      summary.zeroDuration += 1;
    } else if (endsAt < startsAt) {
      summary.negativeDuration += 1;
    }
  }

  return {
    ...summary,
    categoryCounts: Object.fromEntries(
      Object.entries(categoryCounts).sort(
        ([a], [b]) => a.localeCompare(b),
      ),
    ),
  };
}

export const CORE_AMENITY_KINDS: readonly AmenityKind[] = [
  "restroom",
  "water",
  "trash",
  "dog_waste",
  "bench",
  "outlet",
];

export type AmenityCoverageSummary = {
  total: number;
  staticPoints: number;
  fieldPoints: number;
  withFieldPhoto: number;
  byKind: Readonly<Record<string, number>>;
  byTown: Readonly<Record<string, number>>;
  byTownKind: Readonly<Record<string, Readonly<Record<string, number>>>>;
  fieldByTownKind: Readonly<
    Record<string, Readonly<Record<string, number>>>
  >;
  emptyCoreCells: readonly { town: string; kind: AmenityKind }[];
};

function emptyKindCounts(
  kinds: readonly AmenityKind[],
): Record<string, number> {
  return Object.fromEntries(kinds.map((kind) => [kind, 0]));
}

export function summarizeAmenityCoverage(
  points: readonly Amenity[],
  townSlugs: readonly string[],
  coreKinds: readonly AmenityKind[] = CORE_AMENITY_KINDS,
): AmenityCoverageSummary {
  const kinds = [
    ...new Set<AmenityKind>([
      ...coreKinds,
      ...points.map((point) => point.kind),
    ]),
  ];
  const towns = [
    ...new Set([
      ...townSlugs,
      ...points.map((point) => point.municipality || "unknown"),
    ]),
  ];
  const byKind = emptyKindCounts(kinds);
  const byTown = Object.fromEntries(towns.map((town) => [town, 0]));
  const byTownKind = Object.fromEntries(
    towns.map((town) => [town, emptyKindCounts(kinds)]),
  );
  const fieldByTownKind = Object.fromEntries(
    towns.map((town) => [town, emptyKindCounts(kinds)]),
  );
  let fieldPoints = 0;
  let withFieldPhoto = 0;

  for (const point of points) {
    const town = point.municipality || "unknown";
    byKind[point.kind] = (byKind[point.kind] ?? 0) + 1;
    byTown[town] = (byTown[town] ?? 0) + 1;
    byTownKind[town] ??= emptyKindCounts(kinds);
    byTownKind[town][point.kind] =
      (byTownKind[town][point.kind] ?? 0) + 1;
    if (point.id.startsWith("field:")) {
      fieldPoints += 1;
      if (point.photo) withFieldPhoto += 1;
      fieldByTownKind[town] ??= emptyKindCounts(kinds);
      fieldByTownKind[town][point.kind] =
        (fieldByTownKind[town][point.kind] ?? 0) + 1;
    }
  }

  const emptyCoreCells = towns.flatMap((town) =>
    coreKinds.flatMap((kind) =>
      (byTownKind[town]?.[kind] ?? 0) === 0
        ? [{ town, kind }]
        : [],
    ),
  );

  return {
    total: points.length,
    staticPoints: points.length - fieldPoints,
    fieldPoints,
    withFieldPhoto,
    byKind,
    byTown,
    byTownKind,
    fieldByTownKind,
    emptyCoreCells,
  };
}
