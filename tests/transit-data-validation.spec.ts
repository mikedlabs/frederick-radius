import { describe, expect, it } from "vitest";
import {
  validateFrederickTransitArtifacts,
  validateMarcGtfsRows,
  validateMarcScheduleArtifact,
  type FrederickTransitArtifacts,
  type MarcGtfsRows,
} from "../scripts/lib/transit-data-validation";

const NOW = new Date("2026-08-01T12:00:00.000Z");

function frederickFixture(): FrederickTransitArtifacts {
  return {
    transit: {
      generatedAt: "2026-08-01",
      staticFeed: {
        fetchedOn: "2026-08-01",
        serviceWindowStart: "2026-07-30",
        serviceWindowEnd: "2026-08-30",
      },
      routes: [{ id: "route-10" }],
      stops: [{ id: "stop-1", lat: 39.4143, lng: -77.4105 }],
      shapes: {
        "route-10": [
          [39.4143, -77.4105],
          [39.42, -77.42],
        ],
      },
    },
    network: {
      shapeVariants: {
        "route-10": [
          {
            id: "shape-10",
            points: [
              [39.4143, -77.4105],
              [39.42, -77.42],
            ],
          },
        ],
      },
      stopRoutes: { "stop-1": ["route-10"] },
    },
    trips: {
      "trip-10": {
        routeId: "route-10",
        shapeId: "shape-10",
        serviceId: "weekday",
      },
    },
  };
}

function marcFixture() {
  return {
    generatedAt: "2026-08-01",
    staticFeed: {
      fetchedOn: "2026-08-01",
      serviceWindowStart: "2026-07-01",
      serviceWindowEnd: "2026-12-31",
    },
    stations: 2,
    departures: 2,
    calendar: {
      weekday: {
        days: [1, 1, 1, 1, 1, 0, 0],
        start: "20260701",
        end: "20261231",
      },
    },
    exceptions: {},
    stops: {
      east: [{ t: "06:15", min: 375, svc: "weekday", trip: "train-1" }],
      west: [{ t: "17:30", min: 1050, svc: "weekday", trip: "train-2" }],
    },
  };
}

const marcStationStops = [
  { id: "east", lat: 39.411687, lng: -77.40515 },
  { id: "west", lat: 39.411687, lng: -77.40515 },
];

describe("Frederick TransIT artifact validation", () => {
  it("accepts a fresh, internally connected static snapshot", () => {
    expect(validateFrederickTransitArtifacts(frederickFixture(), NOW)).toEqual(
      [],
    );
  });

  it("catches stale calendars, invalid coordinates, and broken references", () => {
    const fixture = structuredClone(frederickFixture()) as {
      transit: {
        generatedAt: string;
        staticFeed: { fetchedOn: string; serviceWindowEnd: string };
        stops: Array<{ lat: number }>;
      };
      network: { stopRoutes: Record<string, string[]> };
      trips: Record<string, { routeId: string; shapeId: string }>;
    };
    fixture.transit.generatedAt = "2026-06-01";
    fixture.transit.staticFeed.fetchedOn = "2026-06-01";
    fixture.transit.staticFeed.serviceWindowEnd = "2026-07-01";
    fixture.transit.stops[0].lat = 0;
    fixture.network.stopRoutes = { "missing-stop": ["missing-route"] };
    fixture.trips["trip-10"].routeId = "missing-route";
    fixture.trips["trip-10"].shapeId = "missing-shape";

    const codes = validateFrederickTransitArtifacts(fixture, NOW).map(
      (issue) => issue.code,
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        "stale_snapshot",
        "expired_calendar",
        "invalid_coordinate",
        "unknown_stop_reference",
        "unknown_route_reference",
        "unknown_shape_reference",
        "missing_route_stops",
      ]),
    );
  });

  it("keeps the service calendar valid through its last Eastern day", () => {
    const fixture = frederickFixture();
    const transit = fixture.transit as {
      staticFeed: { serviceWindowEnd: string };
    };
    transit.staticFeed.serviceWindowEnd = "2026-08-01";

    const beforeEasternMidnight = validateFrederickTransitArtifacts(
      fixture,
      new Date("2026-08-02T03:59:59.999Z"),
    );
    const atEasternMidnight = validateFrederickTransitArtifacts(
      fixture,
      new Date("2026-08-02T04:00:00.000Z"),
    );

    expect(beforeEasternMidnight.map((issue) => issue.code)).not.toContain(
      "expired_calendar",
    );
    expect(atEasternMidnight.map((issue) => issue.code)).toContain(
      "expired_calendar",
    );
  });

  it.each([
    {
      label: "empty",
      routes: [],
      stops: [],
      shapes: {},
      network: {},
      trips: {},
    },
    {
      label: "malformed",
      routes: {},
      stops: {},
      shapes: [],
      network: [],
      trips: [],
    },
  ])(
    "rejects $label top-level route, stop, shape, network, and trip collections",
    (values) => {
      const fixture = frederickFixture();
      const transit = fixture.transit as Record<string, unknown>;
      transit.routes = values.routes;
      transit.stops = values.stops;
      transit.shapes = values.shapes;
      fixture.network = values.network;
      fixture.trips = values.trips;

      const paths = validateFrederickTransitArtifacts(fixture, NOW)
        .filter((issue) => issue.code === "invalid_collection")
        .map((issue) => issue.path);

      expect(paths).toEqual([
        "transit.routes",
        "transit.stops",
        "transit.shapes",
        "network",
        "trips",
      ]);
    },
  );

  it("rejects malformed network indexes", () => {
    const fixture = frederickFixture();
    const network = fixture.network as Record<string, unknown>;
    network.shapeVariants = [];
    network.stopRoutes = null;

    const paths = validateFrederickTransitArtifacts(fixture, NOW)
      .filter((issue) => issue.code === "invalid_collection")
      .map((issue) => issue.path);

    expect(paths).toEqual(["network.shapeVariants", "network.stopRoutes"]);
  });
});

describe("MARC schedule artifact validation", () => {
  it("accepts fresh metadata with complete county stop and service references", () => {
    expect(
      validateMarcScheduleArtifact(marcFixture(), marcStationStops, NOW),
    ).toEqual([]);
  });

  it("catches an expired calendar, stale metadata, bad coordinates, and orphan departures", () => {
    const fixture = structuredClone(marcFixture());
    fixture.generatedAt = "2026-06-01";
    fixture.staticFeed.fetchedOn = "2026-06-01";
    fixture.staticFeed.serviceWindowEnd = "2026-07-31";
    fixture.calendar.weekday.end = "20260731";
    fixture.stations = 1;
    fixture.departures = 1;
    delete (fixture.stops as Partial<typeof fixture.stops>).west;
    fixture.stops.east[0].svc = "missing-service";

    const codes = validateMarcScheduleArtifact(
      fixture,
      [marcStationStops[0], { ...marcStationStops[1], lat: 0 }],
      NOW,
    ).map((issue) => issue.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "stale_snapshot",
        "expired_calendar",
        "invalid_coordinate",
        "missing_service_reference",
        "missing_stop_reference",
      ]),
    );
  });

  it("rejects a non-array departure collection for a MARC stop", () => {
    const fixture: Record<string, unknown> = structuredClone(marcFixture());
    const stops = fixture.stops as Record<string, unknown>;
    stops.east = {
      t: "06:15",
      min: 375,
      svc: "weekday",
      trip: "train-1",
    };
    fixture.departures = 1;

    expect(
      validateMarcScheduleArtifact(fixture, marcStationStops, NOW),
    ).toContainEqual({
      code: "invalid_stop_departures",
      path: "marc.stops.east",
      message: "Each MARC stop must contain an array of departures.",
    });
  });

  it("keeps the service calendar valid through its last Eastern day", () => {
    const fixture = marcFixture();
    fixture.staticFeed.serviceWindowEnd = "2026-08-01";
    fixture.calendar.weekday.end = "20260801";

    const beforeEasternMidnight = validateMarcScheduleArtifact(
      fixture,
      marcStationStops,
      new Date("2026-08-02T03:59:59.999Z"),
    );
    const atEasternMidnight = validateMarcScheduleArtifact(
      fixture,
      marcStationStops,
      new Date("2026-08-02T04:00:00.000Z"),
    );

    expect(beforeEasternMidnight.map((issue) => issue.code)).not.toContain(
      "expired_calendar",
    );
    expect(atEasternMidnight.map((issue) => issue.code)).toContain(
      "expired_calendar",
    );
  });
});

describe("MARC source GTFS reference validation", () => {
  const feed: MarcGtfsRows = {
    routes: [{ route_id: "brunswick" }],
    stops: [
      { stop_id: "east", stop_lat: "39.411687", stop_lon: "-77.40515" },
      { stop_id: "west", stop_lat: "39.411687", stop_lon: "-77.40515" },
    ],
    trips: [
      {
        trip_id: "train-1",
        route_id: "brunswick",
        service_id: "weekday",
      },
    ],
    stopTimes: [
      { trip_id: "train-1", stop_id: "east" },
      { trip_id: "train-1", stop_id: "west" },
    ],
    calendar: [{ service_id: "weekday" }],
    calendarDates: [],
  };

  it("accepts resolved source route, trip, service, and stop references", () => {
    expect(validateMarcGtfsRows(feed, new Set(["east", "west"]))).toEqual([]);
  });

  it("catches invalid source coordinates and missing GTFS references", () => {
    const broken = structuredClone(feed);
    broken.stops[0].stop_lat = "0";
    broken.trips[0].route_id = "missing-route";
    broken.trips[0].service_id = "missing-service";
    broken.stopTimes[0].trip_id = "missing-trip";
    broken.stopTimes[0].stop_id = "missing-stop";

    const codes = validateMarcGtfsRows(
      broken,
      new Set(["east", "west", "absent"]),
    ).map((issue) => issue.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "invalid_coordinate",
        "unknown_route_reference",
        "missing_service_reference",
        "unknown_trip_reference",
        "unknown_stop_reference",
        "missing_stop_reference",
      ]),
    );
  });
});
