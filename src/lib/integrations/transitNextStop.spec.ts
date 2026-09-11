import { describe, expect, it } from "vitest";
import {
  decorateVehiclesWithNextStop,
  resolveNextStop,
  tripUpdatesByTripId,
  type StopMeta,
} from "./transitNextStop";
import type {
  LiveVehicle,
  TripUpdate,
} from "./transitRealtime";

const STOPS: Record<string, StopMeta> = {
  current: {
    id: "current",
    name: "Current stop",
    lat: 39.41,
    lng: -77.41,
  },
  skipped: {
    id: "skipped",
    name: "Skipped stop",
    lat: 39.42,
    lng: -77.42,
  },
  served: {
    id: "served",
    name: "Next served stop",
    lat: 39.43,
    lng: -77.43,
  },
  unknownTime: {
    id: "unknownTime",
    name: "Known stop, no prediction",
    lat: 39.44,
    lng: -77.44,
  },
};

function update(
  overrides: Partial<TripUpdate> = {},
): TripUpdate {
  return {
    tripId: "trip-1",
    stops: [
      {
        stopId: "current",
        stopSequence: 1,
        arrivalEpoch: 1_785_000_100,
      },
      {
        stopId: "served",
        stopSequence: 2,
        arrivalEpoch: 1_785_000_300,
      },
    ],
    ...overrides,
  };
}

describe("transit next-stop resolver", () => {
  it.each(["CANCELED", "DELETED"] as const)(
    "does not decorate a vehicle from a %s trip update",
    (scheduleRelationship) => {
      const vehicles: LiveVehicle[] = [
        {
          vehicleId: "bus-1",
          tripId: "trip-1",
          stopId: "current",
          status: "IN_TRANSIT_TO",
          lat: 39.4,
          lng: -77.4,
        },
      ];

      const [vehicle] = decorateVehiclesWithNextStop(
        vehicles,
        [update({ scheduleRelationship })],
        STOPS,
      );

      expect(vehicle.nextStop).toBeUndefined();
    },
  );

  it("bypasses a skipped reported stop while a vehicle is moving", () => {
    const trip = update({
      stops: [
        {
          stopId: "skipped",
          stopSequence: 1,
          arrivalEpoch: 1_785_000_100,
          scheduleRelationship: "SKIPPED",
        },
        {
          stopId: "served",
          stopSequence: 2,
          arrivalEpoch: 1_785_000_300,
          scheduleRelationship: "SCHEDULED",
        },
      ],
    });

    const result = resolveNextStop(
      {
        tripId: "trip-1",
        stopId: "skipped",
        status: "IN_TRANSIT_TO",
      },
      tripUpdatesByTripId([trip]),
      STOPS,
    );

    expect(result).toMatchObject({
      id: "served",
      name: "Next served stop",
      etaEpoch: 1_785_000_300,
    });
  });

  it("bypasses skipped stops after a vehicle's current stop", () => {
    const trip = update({
      stops: [
        { stopId: "current", stopSequence: 1 },
        {
          stopId: "skipped",
          stopSequence: 2,
          scheduleRelationship: "SKIPPED",
        },
        {
          stopId: "served",
          stopSequence: 3,
          arrivalEpoch: 1_785_000_300,
        },
      ],
    });

    const result = resolveNextStop(
      {
        tripId: "trip-1",
        stopId: "current",
        status: "STOPPED_AT",
      },
      tripUpdatesByTripId([trip]),
      STOPS,
    );

    expect(result).toMatchObject({
      id: "served",
      name: "Next served stop",
      etaEpoch: 1_785_000_300,
    });
  });

  it("keeps a NO_DATA stop as the honest destination without attaching an ETA", () => {
    const trip = update({
      stops: [
        {
          stopId: "unknownTime",
          stopSequence: 1,
          // NO_DATA forbids a realtime time. Include one here to ensure a
          // malformed producer value can never leak into the rider UI.
          arrivalEpoch: 1_785_000_300,
          scheduleRelationship: "NO_DATA",
        },
      ],
    });

    const result = resolveNextStop(
      {
        tripId: "trip-1",
        stopId: "unknownTime",
        status: "IN_TRANSIT_TO",
      },
      tripUpdatesByTripId([trip]),
      STOPS,
    );

    expect(result).toEqual({
      id: "unknownTime",
      name: "Known stop, no prediction",
      lat: 39.44,
      lng: -77.44,
      etaEpoch: undefined,
    });
  });

  it("does not attach an ETA when the next stop after a layover is NO_DATA", () => {
    const trip = update({
      stops: [
        { stopId: "current", stopSequence: 1 },
        {
          stopId: "unknownTime",
          stopSequence: 2,
          departureEpoch: 1_785_000_300,
          scheduleRelationship: "NO_DATA",
        },
      ],
    });

    const result = resolveNextStop(
      {
        tripId: "trip-1",
        stopId: "current",
        status: "STOPPED_AT",
      },
      tripUpdatesByTripId([trip]),
      STOPS,
    );

    expect(result).toMatchObject({
      id: "unknownTime",
      name: "Known stop, no prediction",
    });
    expect(result?.etaEpoch).toBeUndefined();
  });
});
