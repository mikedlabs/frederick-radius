import { describe, expect, it } from "vitest";
import { gtfsRealtime } from "./gtfsRealtimeBindings";

describe("GTFS-Realtime bindings adapter", () => {
  it("round-trips the camel-case fields Radius reads from live feeds", () => {
    const bytes = gtfsRealtime.FeedMessage.encode({
      header: {
        gtfsRealtimeVersion: "2.0",
        timestamp: 1_785_100_000,
      },
      entity: [
        {
          id: "vehicle",
          vehicle: {
            trip: { tripId: "trip-15", routeId: "9349" },
            vehicle: { id: "bus-15" },
            position: {
              latitude: 39.414,
              longitude: -77.411,
              bearing: 92,
            },
            timestamp: 1_785_100_000,
            stopId: "stop-4",
            currentStopSequence: 7,
            currentStatus: 2,
          },
        },
        {
          id: "update",
          tripUpdate: {
            trip: { tripId: "trip-15", routeId: "9349" },
            vehicle: { id: "bus-15" },
            stopTimeUpdate: [
              {
                stopId: "stop-5",
                stopSequence: 8,
                arrival: { time: 1_785_100_300 },
                departure: { time: 1_785_100_360 },
              },
            ],
          },
        },
        {
          id: "alert",
          alert: {
            informedEntity: [{ routeId: "11704", stopId: "frederick" }],
            headerText: { translation: [{ text: "Service change" }] },
            descriptionText: { translation: [{ text: "Use Track 2." }] },
          },
        },
      ],
    }).finish();

    const feed = gtfsRealtime.FeedMessage.decode(bytes);
    const [vehicle, update, alert] = feed.entity;
    const numberValue = (value: number | { toNumber: () => number } | null | undefined) =>
      typeof value === "number" ? value : value?.toNumber();

    expect(feed.header.gtfsRealtimeVersion).toBe("2.0");
    expect(numberValue(feed.header.timestamp)).toBe(1_785_100_000);
    expect(vehicle).toMatchObject({
      id: "vehicle",
      vehicle: {
        trip: { tripId: "trip-15", routeId: "9349" },
        vehicle: { id: "bus-15" },
        position: { bearing: 92 },
        stopId: "stop-4",
        currentStopSequence: 7,
        currentStatus: 2,
      },
    });
    expect(vehicle.vehicle?.position?.latitude).toBeCloseTo(39.414, 4);
    expect(vehicle.vehicle?.position?.longitude).toBeCloseTo(-77.411, 4);
    expect(numberValue(vehicle.vehicle?.timestamp)).toBe(1_785_100_000);
    expect(update).toMatchObject({
      id: "update",
      tripUpdate: {
        trip: { tripId: "trip-15", routeId: "9349" },
        vehicle: { id: "bus-15" },
        stopTimeUpdate: [{ stopId: "stop-5", stopSequence: 8 }],
      },
    });
    expect(
      numberValue(update.tripUpdate?.stopTimeUpdate?.[0]?.arrival?.time),
    ).toBe(1_785_100_300);
    expect(
      numberValue(update.tripUpdate?.stopTimeUpdate?.[0]?.departure?.time),
    ).toBe(1_785_100_360);
    expect(alert).toMatchObject({
      id: "alert",
      alert: {
        informedEntity: [{ routeId: "11704", stopId: "frederick" }],
        headerText: { translation: [{ text: "Service change" }] },
        descriptionText: { translation: [{ text: "Use Track 2." }] },
      },
    });
  });
});
