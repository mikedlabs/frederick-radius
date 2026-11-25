import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  gtfsRealtime,
  type GtfsFeedEntity,
} from "./gtfsRealtimeBindings";
import {
  getLiveVehiclesResult,
  getLiveVehiclesWithNextStopResult,
  getStopPredictionsResult,
  getTransitServiceAlertsResult,
  getTripUpdatesResult,
} from "./transitRealtime";

const { FeedMessage } = gtfsRealtime;

function encodedFeed(
  entity: GtfsFeedEntity[],
  timestamp = 1_785_000_000,
): Uint8Array {
  return FeedMessage.encode({
    header: { gtfsRealtimeVersion: "2.0", timestamp },
    entity,
  }).finish();
}

function protobufResponse(bytes: Uint8Array): Response {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/x-protobuf" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TransIT GTFS-realtime feed metadata", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_785_000_000_000);
  });
  it("preserves the provider timestamp on a successful vehicle feed", async () => {
    const feedTimestamp = 1_785_000_123;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        protobufResponse(
          encodedFeed(
            [
              {
                id: "vehicle-1",
                vehicle: {
                  trip: { routeId: "9349", tripId: "trip-15" },
                  vehicle: { id: "bus-15" },
                  position: { latitude: 39.414, longitude: -77.411 },
                  timestamp: feedTimestamp,
                },
              },
            ],
            feedTimestamp,
          ),
        ),
      ),
    );

    const result = await getLiveVehiclesResult();

    expect(result).toMatchObject({
      status: "ok",
      available: true,
      feedTimestamp,
      data: [
        {
          vehicleId: "bus-15",
          routeId: "9349",
          tripId: "trip-15",
          lat: 39.414,
          lng: -77.411,
          timestamp: feedTimestamp,
        },
      ],
    });
    expect(result.receivedAt).toBeGreaterThan(0);
  });

  it("marks an upstream error unavailable instead of presenting a fresh empty feed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));

    const result = await getStopPredictionsResult();

    expect(result.data).toEqual([]);
    expect(result.status).toBe("unavailable");
    expect(result.available).toBe(false);
    expect(result.feedTimestamp).toBeUndefined();
    expect(result.receivedAt).toBeGreaterThan(0);
  });

  it("passes a caller abort through to the trip-updates request", async () => {
    const parent = new AbortController();
    parent.abort();
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return protobufResponse(encodedFeed([]));
    });
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    const result = await getStopPredictionsResult(parent.signal);

    expect(result).toMatchObject({
      data: [],
      status: "unavailable",
      available: false,
    });
    const requestSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal?.aborted).toBe(true);
  });

  it("preserves arrival identity and schedule state for a stop-level rider decision", async () => {
    const updateTimestamp = 1_785_000_200;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        protobufResponse(
          encodedFeed(
            [
              {
                id: "trip-update-1",
                tripUpdate: {
                  trip: {
                    routeId: "9349",
                    tripId: "trip-15",
                    directionId: 1,
                    scheduleRelationship: 0,
                  },
                  vehicle: { id: "bus-15" },
                  timestamp: updateTimestamp,
                  stopTimeUpdate: [
                    {
                      stopId: "162950",
                      stopSequence: 12,
                      departure: { time: updateTimestamp + 480 },
                      scheduleRelationship: 0,
                    },
                  ],
                },
              },
            ],
            updateTimestamp,
          ),
        ),
      ),
    );

    const result = await getStopPredictionsResult();

    expect(result.data).toEqual([
      {
        stopId: "162950",
        routeId: "9349",
        tripId: "trip-15",
        vehicleId: "bus-15",
        directionId: 1,
        stopSequence: 12,
        arrivalEpoch: updateTimestamp + 480,
        timestamp: updateTimestamp,
        tripScheduleRelationship: "SCHEDULED",
        scheduleRelationship: "SCHEDULED",
      },
    ]);
  });

  it("does not publish canceled trips or skipped stops as inbound arrivals", async () => {
    const updateTimestamp = 1_785_000_250;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        protobufResponse(
          encodedFeed(
            [
              {
                id: "canceled-trip",
                tripUpdate: {
                  trip: {
                    routeId: "9349",
                    tripId: "trip-canceled",
                    scheduleRelationship: 3,
                  },
                  vehicle: { id: "bus-canceled" },
                  timestamp: updateTimestamp,
                  stopTimeUpdate: [
                    {
                      stopId: "162950",
                      arrival: { time: updateTimestamp + 300 },
                    },
                  ],
                },
              },
              {
                id: "skipped-stop",
                tripUpdate: {
                  trip: {
                    routeId: "9349",
                    tripId: "trip-skips-this-stop",
                    scheduleRelationship: 0,
                  },
                  vehicle: { id: "bus-skipping" },
                  timestamp: updateTimestamp,
                  stopTimeUpdate: [
                    {
                      stopId: "162950",
                      arrival: { time: updateTimestamp + 420 },
                      scheduleRelationship: 1,
                    },
                    {
                      stopId: "162951",
                      arrival: { time: updateTimestamp + 600 },
                      scheduleRelationship: 0,
                    },
                  ],
                },
              },
            ],
            updateTimestamp,
          ),
        ),
      ),
    );

    const result = await getStopPredictionsResult();

    expect(result.data).toEqual([
      expect.objectContaining({
        stopId: "162951",
        tripId: "trip-skips-this-stop",
        vehicleId: "bus-skipping",
        scheduleRelationship: "SCHEDULED",
      }),
    ]);
  });

  it("decodes the installed TripDescriptor numeric schedule relationships", async () => {
    const updateTimestamp = 1_785_000_300;
    const relationships = [
      { code: 0, name: "SCHEDULED" },
      { code: 1, name: "ADDED" },
      { code: 2, name: "UNSCHEDULED" },
      { code: 3, name: "CANCELED" },
      { code: 4, name: undefined },
      { code: 5, name: "REPLACEMENT" },
      { code: 6, name: "DUPLICATED" },
      { code: 7, name: "DELETED" },
      { code: 8, name: "NEW" },
    ] as const;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        protobufResponse(
          encodedFeed(
            relationships.map(({ code }) => ({
              id: `relationship-${code}`,
              tripUpdate: {
                trip: {
                  tripId: `trip-${code}`,
                  scheduleRelationship: code,
                },
                stopTimeUpdate: [{ stopId: `stop-${code}` }],
              },
            })),
            updateTimestamp,
          ),
        ),
      ),
    );

    const result = await getTripUpdatesResult();

    expect(
      result.data.map((trip) => trip.scheduleRelationship),
    ).toEqual(relationships.map(({ name }) => name));
  });

  it("filters numeric canceled and deleted trips but keeps operating trip variants", async () => {
    const updateTimestamp = 1_785_000_350;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        protobufResponse(
          encodedFeed(
            [
              { code: 3, id: "canceled" },
              { code: 5, id: "replacement" },
              { code: 6, id: "duplicated" },
              { code: 7, id: "deleted" },
              { code: 8, id: "new" },
            ].map(({ code, id }) => ({
              id,
              tripUpdate: {
                trip: {
                  tripId: `trip-${id}`,
                  scheduleRelationship: code,
                },
                stopTimeUpdate: [
                  {
                    stopId: `stop-${id}`,
                    arrival: { time: updateTimestamp + 300 },
                  },
                ],
              },
            })),
            updateTimestamp,
          ),
        ),
      ),
    );

    const result = await getStopPredictionsResult();

    expect(
      result.data.map((prediction) => ({
        stopId: prediction.stopId,
        relationship: prediction.tripScheduleRelationship,
      })),
    ).toEqual([
      {
        stopId: "stop-replacement",
        relationship: "REPLACEMENT",
      },
      {
        stopId: "stop-duplicated",
        relationship: "DUPLICATED",
      },
      {
        stopId: "stop-new",
        relationship: "NEW",
      },
    ]);
  });

  it("keeps vehicle positions but marks the result degraded when predictions fail", async () => {
    const feedTimestamp = 1_785_000_456;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("vehiclePositions")) {
          return protobufResponse(
            encodedFeed(
              [
                {
                  id: "vehicle-1",
                  vehicle: {
                    trip: { routeId: "9349", tripId: "trip-15" },
                    vehicle: { id: "bus-15" },
                    position: { latitude: 39.414, longitude: -77.411 },
                    timestamp: feedTimestamp,
                  },
                },
              ],
              feedTimestamp,
            ),
          );
        }
        return new Response(null, { status: 503 });
      }),
    );

    const result = await getLiveVehiclesWithNextStopResult();

    expect(result.status).toBe("degraded");
    expect(result.available).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].nextStop).toBeUndefined();
    expect(result.feeds.vehiclePositions).toMatchObject({
      status: "ok",
      available: true,
      feedTimestamp,
    });
    expect(result.feeds.tripUpdates).toMatchObject({
      status: "unavailable",
      available: false,
    });
  });

  it("decodes provider service alerts without treating an empty feed as all clear", async () => {
    const feedTimestamp = 1_785_000_600;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        protobufResponse(
          encodedFeed(
            [
              {
                id: "detour-10",
                alert: {
                  activePeriod: [
                    {
                      start: feedTimestamp,
                      end: feedTimestamp + 3600,
                    },
                  ],
                  informedEntity: [
                    { routeId: "9349" },
                    { stopId: "162950" },
                  ],
                  cause: 10,
                  effect: 4,
                  headerText: {
                    translation: [{ text: "Route 10 detour" }],
                  },
                  descriptionText: {
                    translation: [{ text: "Use the temporary stop." }],
                  },
                },
              },
            ],
            feedTimestamp,
          ),
        ),
      ),
    );

    const result = await getTransitServiceAlertsResult();

    expect(result).toMatchObject({
      available: true,
      status: "ok",
      feedTimestamp,
      data: [
        {
          id: "detour-10",
          header: "Route 10 detour",
          description: "Use the temporary stop.",
          routeIds: ["9349"],
          stopIds: ["162950"],
          activePeriods: [
            {
              start: feedTimestamp,
              end: feedTimestamp + 3600,
            },
          ],
          cause: "Construction",
          effect: "Detour",
        },
      ],
    });
  });
});

describe("published county service exceptions take priority over GTFS-realtime", () => {
  function reportingTrip(routeId: string, arrival: string, startDate?: string): GtfsFeedEntity {
    const trip = { routeId, tripId: `trip-${routeId}`, startDate };
    const timestamp = Date.parse(arrival) / 1000;
    return {
      id: routeId,
      vehicle: { trip, position: { latitude: 39.414, longitude: -77.411 }, timestamp },
      tripUpdate: { trip, stopTimeUpdate: [{ stopId: "162950", arrival: { time: timestamp } }] },
    };
  }

  it.each(["2026-11-26", "2026-11-27"])("suppresses vehicles and arrivals with a healthy feed on %s", async (day) => {
    const now = Date.parse(`${day}T08:00:00-05:00`);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const trips = ["6154", "6169"].map((id) => reportingTrip(id, `${day}T08:05:00-05:00`));
    vi.stubGlobal("fetch", () => Promise.resolve(protobufResponse(encodedFeed(trips, now / 1000))));
    const results = await Promise.all([getLiveVehiclesResult(), getTripUpdatesResult(), getStopPredictionsResult()]);
    for (const result of results) {
      expect(result).toMatchObject({ data: [], status: "ok", available: true, feedTimestamp: now / 1000 });
    }
  });

  it("preserves the first valid Saturday Connector arrival and the shuttle schedule before 7:15", async () => {
    const now = Date.parse("2026-11-28T07:00:00-05:00");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const entities = [
      reportingTrip("6154", "2026-11-28T07:15:00-05:00"),
      reportingTrip("6155", "2026-11-28T07:14:00-05:00"),
      reportingTrip("6169", "2026-11-28T07:05:00-05:00"),
    ];
    vi.stubGlobal("fetch", () => Promise.resolve(protobufResponse(encodedFeed(entities, now / 1000))));
    expect((await getStopPredictionsResult()).data.map((item) => item.routeId)).toEqual(["6154", "6169"]);
    expect((await getTripUpdatesResult()).data.map((item) => item.routeId)).toEqual(["6154", "6169"]);
    expect((await getLiveVehiclesResult()).data.map((item) => item.routeId)).toEqual(["6169"]);
  });

  it("keeps the encoded provider service date when a cancelled Friday trip is replayed on Saturday", async () => {
    const now = Date.parse("2026-11-28T08:30:00-05:00");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const entities = [
      reportingTrip("6154", "2026-11-28T08:35:00-05:00", "20261127"),
      reportingTrip("6155", "2026-11-28T08:35:00-05:00", "20261128"),
    ];
    vi.stubGlobal("fetch", () => Promise.resolve(protobufResponse(encodedFeed(entities, now / 1000))));
    for (const result of await Promise.all([getLiveVehiclesResult(), getStopPredictionsResult(), getTripUpdatesResult()])) {
      expect(result.data.map((item) => item.routeId)).toEqual(["6155"]);
    }
  });

  it("filters a prediction that crosses the local midnight into a closure", async () => {
    const now = Date.parse("2026-11-25T23:59:00-05:00");
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.stubGlobal("fetch", () => Promise.resolve(protobufResponse(encodedFeed([
      reportingTrip("6154", "2026-11-26T00:01:00-05:00"),
    ], now / 1000))));
    expect((await getStopPredictionsResult()).data).toEqual([]);
    expect((await getTripUpdatesResult()).data).toEqual([]);
  });
});
