import { describe, expect, it } from "vitest";

import {
  FAIR_LIVE_FRESH_MS,
  FAIR_MOVING_VEHICLE_MAX_AGE_MS,
  FAIR_VISIBLE_POLL_WINDOW_MS,
  deriveFairArrivalTruth,
  fairTransitEvidenceSchema,
} from "@/lib/fair/arrival";
import { buildGreatFrederickFairTransitEvidence } from "@/lib/fair/transit";

const staticEvidence = fairTransitEvidenceSchema.parse(
  buildGreatFrederickFairTransitEvidence(),
);
const now = "2026-09-20T12:00:00-04:00";

function atAge(ageMs: number): string {
  return new Date(Date.parse(now) - ageMs).toISOString();
}

describe("Fair arrival truth", () => {
  it("does not turn static feed coverage into Fair-date service", () => {
    const truth = deriveFairArrivalTruth({
      staticEvidence,
      serviceDateEvidence: { status: "unknown" },
      live: { status: "missing" },
      now,
    });

    expect(truth).toMatchObject({
      kind: "static-route-association",
      serviceOnFairDate: "unknown",
      includesArrivalTimes: false,
      shouldPoll: false,
    });
  });

  it("marks live data stale at 45 seconds and removes moving vehicles at 2 minutes", () => {
    const base = {
      staticEvidence,
      serviceDateEvidence: { status: "unknown" as const },
      now,
      visibleSince: atAge(1_000),
    };
    const live = (ageMs: number) => ({
      status: "available" as const,
      serviceDate: "2026-09-20",
      fetchedAt: atAge(ageMs),
      arrivals: [
        {
          id: "arrival-1",
          routeId: "6168",
          stopId: "162918",
          expectedAt: "2026-09-20T12:10:00-04:00",
        },
      ],
      movingVehicleCount: 2,
    });

    expect(deriveFairArrivalTruth({ ...base, live: live(44_999) })).toMatchObject({
      kind: "live-fresh",
      showMovingVehicles: true,
      movingVehicleCount: 2,
    });
    expect(
      deriveFairArrivalTruth({ ...base, live: live(FAIR_LIVE_FRESH_MS) }),
    ).toMatchObject({ kind: "live-stale", showMovingVehicles: true });
    expect(
      deriveFairArrivalTruth({
        ...base,
        live: live(FAIR_MOVING_VEHICLE_MAX_AGE_MS),
      }),
    ).toMatchObject({
      kind: "live-stale",
      showMovingVehicles: false,
      movingVehicleCount: 0,
    });
  });

  it("stops polling after five visible minutes", () => {
    const input = {
      staticEvidence,
      serviceDateEvidence: {
        status: "confirmed" as const,
        serviceDate: "2026-09-20",
        confirmedAt: "2026-09-20T11:00:00-04:00",
        sourceUrl: "https://example.com/service",
      },
      live: { status: "missing" as const },
      now,
    };

    expect(
      deriveFairArrivalTruth({
        ...input,
        visibleSince: atAge(FAIR_VISIBLE_POLL_WINDOW_MS - 1),
      }).shouldPoll,
    ).toBe(true);
    expect(
      deriveFairArrivalTruth({
        ...input,
        visibleSince: atAge(FAIR_VISIBLE_POLL_WINDOW_MS),
      }).shouldPoll,
    ).toBe(false);
  });

  it("treats a missing or failed feed as unknown, never no service", () => {
    const unavailable = deriveFairArrivalTruth({
      staticEvidence,
      serviceDateEvidence: { status: "unknown" },
      live: {
        status: "unavailable",
        checkedAt: now,
        reason: "The live arrival source did not respond.",
      },
      now,
      visibleSince: now,
    });

    expect(unavailable).toMatchObject({
      kind: "live-unavailable",
      doesNotMeanNoService: true,
      serviceOnFairDate: "unknown",
    });
    expect(JSON.stringify(unavailable)).not.toContain('"no-service"');
  });

  it("rejects live or confirmed service evidence outside the Fair dates", () => {
    expect(() =>
      deriveFairArrivalTruth({
        staticEvidence,
        serviceDateEvidence: {
          status: "confirmed",
          serviceDate: "2026-09-27",
          confirmedAt: now,
          sourceUrl: "https://example.com/service",
        },
        live: { status: "missing" },
        now,
      }),
    ).toThrow("inside the reviewed Fair dates");
  });

  it("rejects transit evidence that claims arrivals or walking distance", () => {
    expect(
      fairTransitEvidenceSchema.safeParse({
        ...staticEvidence,
        evidenceState: {
          ...staticEvidence.evidenceState,
          includesArrivalTimes: true,
        },
      }).success,
    ).toBe(false);
    expect(
      fairTransitEvidenceSchema.safeParse({
        ...staticEvidence,
        nearestStops: staticEvidence.nearestStops.map((stop, index) =>
          index === 0
            ? {
                ...stop,
                approachDistance: {
                  ...stop.approachDistance,
                  isWalkingRoute: true,
                },
              }
            : stop,
        ),
      }).success,
    ).toBe(false);
  });
});
