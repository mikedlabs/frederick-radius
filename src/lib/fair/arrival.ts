import { z } from "zod";

export const FAIR_LIVE_FRESH_MS = 45_000;
export const FAIR_MOVING_VEHICLE_MAX_AGE_MS = 120_000;
export const FAIR_VISIBLE_POLL_WINDOW_MS = 300_000;

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const offsetTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  .refine((value) => Number.isFinite(Date.parse(value)));

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"));
const httpsUrlOrNullSchema = z.union([httpsUrlSchema, z.null()]);

const coordinateSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  })
  .strict();

const transitRouteSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    short: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    evidence: z.literal("committed_static_stop_route_association"),
  })
  .strict();

const transitStopEvidenceSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(2).max(200),
    coordinate: coordinateSchema,
    approachDistance: z
      .object({
        meters: z.number().int().nonnegative(),
        method: z.literal("straight_line_geometric"),
        isWalkingRoute: z.literal(false),
        label: z.literal("Straight-line distance, not a walking route"),
      })
      .strict(),
    association: z
      .object({
        state: z.enum([
          "published_static_association",
          "partial_static_association",
          "missing_static_association",
          "unresolved_static_association",
        ]),
        routeIds: z.array(z.string().trim().min(1).max(80)).max(40),
        unresolvedRouteIds: z.array(z.string().trim().min(1).max(80)).max(40),
        serviceOnFairDates: z.literal("unknown"),
      })
      .strict(),
    routes: z.array(transitRouteSchema).max(40),
  })
  .strict();

export const fairTransitEvidenceSchema = z
  .object({
    venue: coordinateSchema,
    fairDateRange: z
      .object({ start: localDateSchema, end: localDateSchema })
      .strict(),
    nearestStops: z.array(transitStopEvidenceSchema).max(12),
    featuredStop: z.union([transitStopEvidenceSchema, z.null()]),
    feedCoverage: z
      .object({
        kind: z.literal("static_feed_date_window"),
        start: z.union([localDateSchema, z.null()]),
        end: z.union([localDateSchema, z.null()]),
        status: z.enum(["full", "partial", "none", "unknown"]),
        coversFullFair: z.boolean(),
      })
      .strict(),
    evidenceState: z
      .object({
        kind: z.literal("static_network_context_only"),
        confirmsServiceOnFairDates: z.literal(false),
        includesArrivalTimes: z.literal(false),
        sourceFetchedOn: z.union([localDateSchema, z.null()]),
        sourceUrl: httpsUrlOrNullSchema,
        label: z.literal(
          "Static stop and route context only. Service dates and arrival times are not confirmed.",
        ),
      })
      .strict(),
  })
  .strict()
  .superRefine((evidence, ctx) => {
    if (evidence.fairDateRange.start > evidence.fairDateRange.end) {
      ctx.addIssue({
        code: "custom",
        message: "Fair transit date range is reversed",
        path: ["fairDateRange", "end"],
      });
    }

    const stopIds = new Set<string>();
    evidence.nearestStops.forEach((stop, index) => {
      if (stopIds.has(stop.id)) {
        ctx.addIssue({
          code: "custom",
          message: "nearest stop ids must be unique",
          path: ["nearestStops", index, "id"],
        });
      }
      stopIds.add(stop.id);
    });

    const coverage = evidence.feedCoverage;
    const hasWindow = coverage.start !== null && coverage.end !== null;
    if (
      (coverage.status === "unknown" && hasWindow) ||
      (coverage.status !== "unknown" && !hasWindow) ||
      coverage.coversFullFair !== (coverage.status === "full")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "static feed coverage fields are inconsistent",
        path: ["feedCoverage"],
      });
    }
  });

export type FairStaticTransitEvidence = z.infer<
  typeof fairTransitEvidenceSchema
>;

export type FairDateServiceEvidence =
  | { status: "unknown" }
  | {
      status: "confirmed";
      serviceDate: string;
      confirmedAt: string;
      sourceUrl: string;
    };

export type FairLiveArrival = {
  id: string;
  routeId: string;
  stopId: string;
  expectedAt: string;
};

export type FairLiveSnapshot =
  | { status: "missing" }
  | {
      status: "unavailable";
      checkedAt: string;
      reason: string;
    }
  | {
      status: "available";
      serviceDate: string;
      fetchedAt: string;
      arrivals: FairLiveArrival[];
      movingVehicleCount: number;
    };

export type FairArrivalTruth =
  | {
      kind: "official-static-fact";
      label: string;
      sourceUrl: string;
      serviceOnFairDate: "unknown";
      includesArrivalTimes: false;
      shouldPoll: false;
    }
  | {
      kind: "static-route-association";
      label: string;
      serviceOnFairDate: "unknown";
      includesArrivalTimes: false;
      shouldPoll: false;
    }
  | {
      kind: "date-service-confirmed";
      serviceDate: string;
      sourceUrl: string;
      serviceOnFairDate: "confirmed";
      includesArrivalTimes: false;
      shouldPoll: boolean;
    }
  | {
      kind: "live-fresh" | "live-stale";
      serviceDate: string;
      arrivals: FairLiveArrival[];
      ageMs: number;
      serviceOnFairDate: "confirmed";
      includesArrivalTimes: true;
      showMovingVehicles: boolean;
      movingVehicleCount: number;
      shouldPoll: boolean;
    }
  | {
      kind: "live-unavailable";
      reason: string;
      checkedAt: string | null;
      doesNotMeanNoService: true;
      serviceOnFairDate: "unknown" | "confirmed";
      includesArrivalTimes: false;
      shouldPoll: boolean;
    };

export type DeriveFairArrivalTruthInput = {
  staticEvidence: FairStaticTransitEvidence;
  serviceDateEvidence: FairDateServiceEvidence;
  live: FairLiveSnapshot;
  now: string;
  visibleSince?: string | null;
  officialStaticFact?: { label: string; sourceUrl: string } | null;
};

function timestampMs(value: string, label: string): number {
  const parsed = offsetTimestampSchema.safeParse(value);
  if (!parsed.success) throw new TypeError(`${label} must be an offset timestamp.`);
  return Date.parse(value);
}

function isPollingAllowed(nowMs: number, visibleSince?: string | null): boolean {
  if (!visibleSince) return false;
  const visibleSinceMs = timestampMs(visibleSince, "visibleSince");
  return (
    nowMs >= visibleSinceMs &&
    nowMs - visibleSinceMs < FAIR_VISIBLE_POLL_WINDOW_MS
  );
}

function parseLiveArrivals(arrivals: readonly FairLiveArrival[]): FairLiveArrival[] {
  if (arrivals.length > 50) {
    throw new RangeError("A Fair live snapshot may contain at most 50 arrivals.");
  }
  const ids = new Set<string>();
  return arrivals.map((arrival) => {
    if (
      !arrival.id ||
      arrival.id.length > 120 ||
      !arrival.routeId ||
      arrival.routeId.length > 80 ||
      !arrival.stopId ||
      arrival.stopId.length > 80
    ) {
      throw new TypeError("Fair live arrival identifiers are invalid.");
    }
    timestampMs(arrival.expectedAt, "expectedAt");
    if (ids.has(arrival.id)) {
      throw new TypeError("Fair live arrival ids must be unique.");
    }
    ids.add(arrival.id);
    return { ...arrival };
  });
}

function assertFairServiceDate(
  value: string,
  evidence: FairStaticTransitEvidence,
): void {
  if (
    !localDateSchema.safeParse(value).success ||
    value < evidence.fairDateRange.start ||
    value > evidence.fairDateRange.end
  ) {
    throw new RangeError("serviceDate must fall inside the reviewed Fair dates.");
  }
}

/**
 * Converts evidence into display truth without treating feed coverage, route
 * membership, or a failed request as proof that a bus is running or absent.
 */
export function deriveFairArrivalTruth(
  input: DeriveFairArrivalTruthInput,
): FairArrivalTruth {
  const staticEvidence = fairTransitEvidenceSchema.parse(input.staticEvidence);
  const nowMs = timestampMs(input.now, "now");
  const shouldPoll = isPollingAllowed(nowMs, input.visibleSince);

  if (input.live.status === "available") {
    assertFairServiceDate(input.live.serviceDate, staticEvidence);
    const fetchedAtMs = timestampMs(input.live.fetchedAt, "fetchedAt");
    if (fetchedAtMs > nowMs) {
      throw new RangeError("A Fair live snapshot cannot come from the future.");
    }
    if (
      !Number.isInteger(input.live.movingVehicleCount) ||
      input.live.movingVehicleCount < 0 ||
      input.live.movingVehicleCount > 1_000
    ) {
      throw new TypeError("movingVehicleCount must be a nonnegative integer.");
    }
    const ageMs = nowMs - fetchedAtMs;
    return {
      kind: ageMs < FAIR_LIVE_FRESH_MS ? "live-fresh" : "live-stale",
      serviceDate: input.live.serviceDate,
      arrivals: parseLiveArrivals(input.live.arrivals),
      ageMs,
      serviceOnFairDate: "confirmed",
      includesArrivalTimes: true,
      showMovingVehicles: ageMs < FAIR_MOVING_VEHICLE_MAX_AGE_MS,
      movingVehicleCount:
        ageMs < FAIR_MOVING_VEHICLE_MAX_AGE_MS
          ? input.live.movingVehicleCount
          : 0,
      shouldPoll,
    };
  }

  if (input.live.status === "unavailable") {
    const checkedAtMs = timestampMs(input.live.checkedAt, "checkedAt");
    if (checkedAtMs > nowMs) {
      throw new RangeError("A Fair live check cannot come from the future.");
    }
    if (input.live.reason.trim().length < 12) {
      throw new TypeError("Live unavailability needs a specific reason.");
    }
    return {
      kind: "live-unavailable",
      reason: input.live.reason.trim(),
      checkedAt: input.live.checkedAt,
      doesNotMeanNoService: true,
      serviceOnFairDate:
        input.serviceDateEvidence.status === "confirmed"
          ? "confirmed"
          : "unknown",
      includesArrivalTimes: false,
      shouldPoll,
    };
  }

  if (input.serviceDateEvidence.status === "confirmed") {
    assertFairServiceDate(input.serviceDateEvidence.serviceDate, staticEvidence);
    const confirmedAtMs = timestampMs(
      input.serviceDateEvidence.confirmedAt,
      "confirmedAt",
    );
    if (confirmedAtMs > nowMs) {
      throw new RangeError("Confirmed service evidence cannot come from the future.");
    }
    if (!httpsUrlSchema.safeParse(input.serviceDateEvidence.sourceUrl).success) {
      throw new TypeError("Confirmed service evidence requires an HTTPS source.");
    }
    return {
      kind: "date-service-confirmed",
      serviceDate: input.serviceDateEvidence.serviceDate,
      sourceUrl: input.serviceDateEvidence.sourceUrl,
      serviceOnFairDate: "confirmed",
      includesArrivalTimes: false,
      shouldPoll,
    };
  }

  const hasPublishedAssociation = [
    ...staticEvidence.nearestStops,
    ...(staticEvidence.featuredStop ? [staticEvidence.featuredStop] : []),
  ].some((stop) => stop.routes.length > 0);
  if (hasPublishedAssociation) {
    return {
      kind: "static-route-association",
      label: staticEvidence.evidenceState.label,
      serviceOnFairDate: "unknown",
      includesArrivalTimes: false,
      shouldPoll: false,
    };
  }

  if (input.officialStaticFact) {
    if (
      input.officialStaticFact.label.trim().length < 2 ||
      !httpsUrlSchema.safeParse(input.officialStaticFact.sourceUrl).success
    ) {
      throw new TypeError("Official arrival facts require a label and HTTPS source.");
    }
    return {
      kind: "official-static-fact",
      label: input.officialStaticFact.label.trim(),
      sourceUrl: input.officialStaticFact.sourceUrl,
      serviceOnFairDate: "unknown",
      includesArrivalTimes: false,
      shouldPoll: false,
    };
  }

  return {
    kind: "live-unavailable",
    reason: "No reviewed route, service-date, or live arrival evidence is available.",
    checkedAt: null,
    doesNotMeanNoService: true,
    serviceOnFairDate: "unknown",
    includesArrivalTimes: false,
    shouldPoll: false,
  };
}
