import { describe, expect, it } from "vitest";
import TRANSIT from "@/data/transit.json";
import TRANSIT_NETWORK from "@/data/transit-network.json";
import {
  buildFairTransitEvidence,
  buildGreatFrederickFairTransitEvidence,
  describeFairTransitFeedCoverage,
  GREAT_FREDERICK_FAIRGROUND_CENTER_STOP_ID,
  type FairTransitDataset,
  type FairTransitNetworkDataset,
} from "./transit";

const FAIR_DATES = { start: "2026-09-18", end: "2026-09-26" };

const FIXTURE_TRANSIT: FairTransitDataset = {
  routes: [
    { id: "route-a", short: "A", name: "Route A" },
    { id: "route-b", short: "B", name: "Route B" },
  ],
  stops: [
    { id: "far", name: "Far Stop", lat: 39.42, lng: -77.41 },
    { id: "near-b", name: "Beta Stop", lat: 39.4105, lng: -77.4 },
    { id: "near-a", name: "Alpha Stop", lat: 39.4105, lng: -77.4 },
  ],
  staticFeed: {
    fetchedOn: "2026-09-10",
    serviceWindowStart: "2026-09-01",
    serviceWindowEnd: "2026-09-30",
    sourceUrl: "https://example.com/transit.zip",
  },
};

describe("Fair transit evidence", () => {
  it("sorts nearest stops by geometric distance with a stable tie break", () => {
    const result = buildFairTransitEvidence({
      venue: { lat: 39.41, lng: -77.4 },
      fairDateRange: FAIR_DATES,
      transit: FIXTURE_TRANSIT,
      network: { stopRoutes: {} },
    });

    expect(result.nearestStops.map((stop) => stop.id)).toEqual([
      "near-a",
      "near-b",
      "far",
    ]);
    expect(result.nearestStops[0].approachDistance).toMatchObject({
      method: "straight_line_geometric",
      isWalkingRoute: false,
      label: "Straight-line distance, not a walking route",
    });
    expect(result.evidenceState).toMatchObject({
      kind: "static_network_context_only",
      confirmsServiceOnFairDates: false,
      includesArrivalTimes: false,
      sourceFetchedOn: "2026-09-10",
      sourceUrl: "https://example.com/transit.zip",
    });
  });

  it("joins published route records without converting membership into service evidence", () => {
    const result = buildFairTransitEvidence({
      venue: { lat: 39.41, lng: -77.4 },
      fairDateRange: FAIR_DATES,
      transit: FIXTURE_TRANSIT,
      network: { stopRoutes: { "near-a": ["route-b", "route-a"] } },
      featuredStopId: "near-a",
    });

    expect(result.featuredStop?.routes).toEqual([
      {
        id: "route-b",
        short: "B",
        name: "Route B",
        evidence: "committed_static_stop_route_association",
      },
      {
        id: "route-a",
        short: "A",
        name: "Route A",
        evidence: "committed_static_stop_route_association",
      },
    ]);
    expect(result.featuredStop?.association).toMatchObject({
      state: "published_static_association",
      serviceOnFairDates: "unknown",
      unresolvedRouteIds: [],
    });
  });

  it("distinguishes full, partial, and unknown static-feed date coverage", () => {
    expect(
      describeFairTransitFeedCoverage(FAIR_DATES, {
        serviceWindowStart: "2026-09-01",
        serviceWindowEnd: "2026-09-30",
      }),
    ).toEqual({
      kind: "static_feed_date_window",
      start: "2026-09-01",
      end: "2026-09-30",
      status: "full",
      coversFullFair: true,
    });
    expect(
      describeFairTransitFeedCoverage(FAIR_DATES, {
        serviceWindowStart: "2026-08-21",
        serviceWindowEnd: "2026-09-21",
      }),
    ).toEqual({
      kind: "static_feed_date_window",
      start: "2026-08-21",
      end: "2026-09-21",
      status: "partial",
      coversFullFair: false,
    });
    expect(describeFairTransitFeedCoverage(FAIR_DATES)).toEqual({
      kind: "static_feed_date_window",
      start: null,
      end: null,
      status: "unknown",
      coversFullFair: false,
    });
  });

  it("keeps missing and unresolved route associations explicit", () => {
    const result = buildFairTransitEvidence({
      venue: { lat: 39.41, lng: -77.4 },
      fairDateRange: FAIR_DATES,
      transit: FIXTURE_TRANSIT,
      network: {
        stopRoutes: {
          "near-a": ["route-a", "route-unknown"],
          "near-b": ["route-unknown"],
        },
      },
    });
    const byId = new Map(result.nearestStops.map((stop) => [stop.id, stop]));

    expect(byId.get("far")?.association).toMatchObject({
      state: "missing_static_association",
      routeIds: [],
      unresolvedRouteIds: [],
      serviceOnFairDates: "unknown",
    });
    expect(byId.get("near-a")?.association).toMatchObject({
      state: "partial_static_association",
      routeIds: ["route-a", "route-unknown"],
      unresolvedRouteIds: ["route-unknown"],
      serviceOnFairDates: "unknown",
    });
    expect(byId.get("near-b")?.association).toMatchObject({
      state: "unresolved_static_association",
      unresolvedRouteIds: ["route-unknown"],
      serviceOnFairDates: "unknown",
    });
  });

  it("surfaces Fairground Center using the current committed associations only", () => {
    const result = buildGreatFrederickFairTransitEvidence();
    const network = TRANSIT_NETWORK as FairTransitNetworkDataset;
    const transit = TRANSIT as FairTransitDataset;
    const publishedRouteIds =
      network.stopRoutes?.[GREAT_FREDERICK_FAIRGROUND_CENTER_STOP_ID] ?? [];
    const routeById = new Map(transit.routes.map((route) => [route.id, route]));

    expect(result.featuredStop?.name).toBe(
      "East Patrick Street at Fairground Center",
    );
    expect(result.featuredStop?.association.routeIds).toEqual(publishedRouteIds);
    expect(result.featuredStop?.routes.map((route) => route.id)).toEqual(
      publishedRouteIds.filter((routeId) => routeById.has(routeId)),
    );
    expect(result.featuredStop?.association.serviceOnFairDates).toBe("unknown");
    expect(result.evidenceState.confirmsServiceOnFairDates).toBe(false);
    expect(result.evidenceState.includesArrivalTimes).toBe(false);
    expect(result.feedCoverage).toEqual(
      describeFairTransitFeedCoverage(FAIR_DATES, transit.staticFeed),
    );
  });
});
