import TRANSIT_RAW from "@/data/transit.json";
import TRANSIT_NETWORK_RAW from "@/data/transit-network.json";
import { haversineMeters, type LngLat } from "@/lib/geo";

export type FairDateRange = {
  start: string;
  end: string;
};

export type FairTransitRoute = {
  id: string;
  short: string;
  name: string;
};

export type FairTransitStop = {
  id: string | number;
  name: string;
  lat: number;
  lng: number;
};

export type FairTransitStaticFeed = {
  fetchedOn?: string;
  serviceWindowStart?: string;
  serviceWindowEnd?: string;
  sourceUrl?: string;
};

export type FairTransitDataset = {
  routes: FairTransitRoute[];
  stops: FairTransitStop[];
  staticFeed?: FairTransitStaticFeed;
};

export type FairTransitNetworkDataset = {
  stopRoutes?: Record<string, string[]>;
};

export type FairTransitAssociationState =
  | "published_static_association"
  | "partial_static_association"
  | "missing_static_association"
  | "unresolved_static_association";

export type FairTransitStopEvidence = {
  id: string;
  name: string;
  coordinate: LngLat;
  approachDistance: {
    meters: number;
    method: "straight_line_geometric";
    isWalkingRoute: false;
    label: "Straight-line distance, not a walking route";
  };
  association: {
    state: FairTransitAssociationState;
    routeIds: string[];
    unresolvedRouteIds: string[];
    serviceOnFairDates: "unknown";
  };
  routes: Array<
    FairTransitRoute & {
      evidence: "committed_static_stop_route_association";
    }
  >;
};

export type FairTransitFeedCoverage = {
  kind: "static_feed_date_window";
  start: string | null;
  end: string | null;
  status: "full" | "partial" | "none" | "unknown";
  coversFullFair: boolean;
};

export type FairTransitEvidence = {
  venue: LngLat;
  fairDateRange: FairDateRange;
  nearestStops: FairTransitStopEvidence[];
  featuredStop: FairTransitStopEvidence | null;
  feedCoverage: FairTransitFeedCoverage;
  evidenceState: {
    kind: "static_network_context_only";
    confirmsServiceOnFairDates: false;
    includesArrivalTimes: false;
    sourceFetchedOn: string | null;
    sourceUrl: string | null;
    label: "Static stop and route context only. Service dates and arrival times are not confirmed.";
  };
};

export type BuildFairTransitEvidenceInput = {
  venue: LngLat;
  fairDateRange: FairDateRange;
  transit: FairTransitDataset;
  network: FairTransitNetworkDataset;
  nearestStopLimit?: number;
  featuredStopId?: string;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function assertFairDateRange(range: FairDateRange): void {
  if (!isIsoDay(range.start) || !isIsoDay(range.end)) {
    throw new TypeError("Fair dates must use valid YYYY-MM-DD calendar days.");
  }
  if (range.start > range.end) {
    throw new RangeError("The Fair date range must start on or before it ends.");
  }
}

function assertCoordinate(point: LngLat): void {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    point.lat < -90 ||
    point.lat > 90 ||
    point.lng < -180 ||
    point.lng > 180
  ) {
    throw new RangeError("The Fair venue coordinate is invalid.");
  }
}

export function describeFairTransitFeedCoverage(
  fairDateRange: FairDateRange,
  staticFeed?: FairTransitStaticFeed,
): FairTransitFeedCoverage {
  assertFairDateRange(fairDateRange);

  const start = staticFeed?.serviceWindowStart;
  const end = staticFeed?.serviceWindowEnd;
  if (!isIsoDay(start) || !isIsoDay(end) || start > end) {
    return {
      kind: "static_feed_date_window",
      start: null,
      end: null,
      status: "unknown",
      coversFullFair: false,
    };
  }

  const coversFullFair = start <= fairDateRange.start && end >= fairDateRange.end;
  if (coversFullFair) {
    return {
      kind: "static_feed_date_window",
      start,
      end,
      status: "full",
      coversFullFair: true,
    };
  }

  const overlapsFair = start <= fairDateRange.end && end >= fairDateRange.start;
  return {
    kind: "static_feed_date_window",
    start,
    end,
    status: overlapsFair ? "partial" : "none",
    coversFullFair: false,
  };
}

function joinStopEvidence(
  stop: FairTransitStop,
  approachDistanceMeters: number,
  routeById: ReadonlyMap<string, FairTransitRoute>,
  stopRoutes: Readonly<Record<string, string[]>>,
): FairTransitStopEvidence {
  const id = String(stop.id);
  const routeIds = Array.from(new Set(stopRoutes[id] ?? []));
  const routes: FairTransitStopEvidence["routes"] = [];
  const unresolvedRouteIds: string[] = [];

  for (const routeId of routeIds) {
    const route = routeById.get(routeId);
    if (!route) {
      unresolvedRouteIds.push(routeId);
      continue;
    }
    routes.push({
      id: route.id,
      short: route.short,
      name: route.name,
      evidence: "committed_static_stop_route_association",
    });
  }

  let state: FairTransitAssociationState;
  if (routeIds.length === 0) {
    state = "missing_static_association";
  } else if (routes.length === 0) {
    state = "unresolved_static_association";
  } else if (unresolvedRouteIds.length > 0) {
    state = "partial_static_association";
  } else {
    state = "published_static_association";
  }

  return {
    id,
    name: stop.name,
    coordinate: { lat: stop.lat, lng: stop.lng },
    approachDistance: {
      meters: Math.round(approachDistanceMeters),
      method: "straight_line_geometric",
      isWalkingRoute: false,
      label: "Straight-line distance, not a walking route",
    },
    association: {
      state,
      routeIds,
      unresolvedRouteIds,
      serviceOnFairDates: "unknown",
    },
    routes,
  };
}

/**
 * Builds static transit context around a Fair venue. Route membership comes
 * from the committed GTFS stop-to-route index. It is deliberately not a
 * calendar lookup, trip planner, or realtime arrival result.
 */
export function buildFairTransitEvidence(
  input: BuildFairTransitEvidenceInput,
): FairTransitEvidence {
  assertCoordinate(input.venue);
  assertFairDateRange(input.fairDateRange);

  const routeById = new Map(
    input.transit.routes.map((route) => [String(route.id), route] as const),
  );
  const stopRoutes = input.network.stopRoutes ?? {};
  const requestedLimit = input.nearestStopLimit ?? 3;
  const nearestStopLimit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.floor(requestedLimit))
    : 0;

  const validStops = input.transit.stops.filter(
    (stop) =>
      Number.isFinite(stop.lat) &&
      Number.isFinite(stop.lng) &&
      stop.lat >= -90 &&
      stop.lat <= 90 &&
      stop.lng >= -180 &&
      stop.lng <= 180,
  );
  const evidenceById = new Map(
    validStops.map((stop) => {
      const unroundedDistanceMeters = haversineMeters(input.venue, stop);
      return [
        String(stop.id),
        {
          evidence: joinStopEvidence(
            stop,
            unroundedDistanceMeters,
            routeById,
            stopRoutes,
          ),
          unroundedDistanceMeters,
        },
      ] as const;
    }),
  );

  const nearestStops = Array.from(evidenceById.values())
    .sort(
      (left, right) =>
        left.unroundedDistanceMeters - right.unroundedDistanceMeters ||
        (left.evidence.name < right.evidence.name
          ? -1
          : left.evidence.name > right.evidence.name
            ? 1
            : 0) ||
        (left.evidence.id < right.evidence.id
          ? -1
          : left.evidence.id > right.evidence.id
            ? 1
            : 0),
    )
    .slice(0, nearestStopLimit)
    .map(({ evidence }) => evidence);

  return {
    venue: { ...input.venue },
    fairDateRange: { ...input.fairDateRange },
    nearestStops,
    featuredStop: input.featuredStopId
      ? evidenceById.get(String(input.featuredStopId))?.evidence ?? null
      : null,
    feedCoverage: describeFairTransitFeedCoverage(
      input.fairDateRange,
      input.transit.staticFeed,
    ),
    evidenceState: {
      kind: "static_network_context_only",
      confirmsServiceOnFairDates: false,
      includesArrivalTimes: false,
      sourceFetchedOn: isIsoDay(input.transit.staticFeed?.fetchedOn)
        ? input.transit.staticFeed.fetchedOn
        : null,
      sourceUrl:
        typeof input.transit.staticFeed?.sourceUrl === "string" &&
        input.transit.staticFeed.sourceUrl.startsWith("https://")
          ? input.transit.staticFeed.sourceUrl
          : null,
      label:
        "Static stop and route context only. Service dates and arrival times are not confirmed.",
    },
  };
}

export const GREAT_FREDERICK_FAIR_2026_DATE_RANGE: FairDateRange = {
  start: "2026-09-18",
  end: "2026-09-26",
};

/** The committed Radius place coordinate for 797 East Patrick Street. */
export const GREAT_FREDERICK_FAIR_VENUE_COORDINATE: LngLat = {
  lat: 39.411157,
  lng: -77.394615,
};

export const GREAT_FREDERICK_FAIRGROUND_CENTER_STOP_ID = "162918";

/**
 * A default 2026 Fair snapshot that keeps Fairground Center visible while
 * preserving geometric nearest-stop ordering for the surrounding list.
 */
export function buildGreatFrederickFairTransitEvidence(): FairTransitEvidence {
  return buildFairTransitEvidence({
    venue: GREAT_FREDERICK_FAIR_VENUE_COORDINATE,
    fairDateRange: GREAT_FREDERICK_FAIR_2026_DATE_RANGE,
    transit: TRANSIT_RAW as FairTransitDataset,
    network: TRANSIT_NETWORK_RAW as FairTransitNetworkDataset,
    nearestStopLimit: 5,
    featuredStopId: GREAT_FREDERICK_FAIRGROUND_CENTER_STOP_ID,
  });
}
