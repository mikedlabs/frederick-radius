import { afterEach, describe, expect, it, vi } from "vitest";
import {
  gtfsRealtime,
  type GtfsFeedEntity,
} from "./gtfsRealtimeBindings";
import {
  getLiveVehiclesResult,
  getLiveVehiclesWithNextStopResult,
  getStopPredictionsResult,
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
});
