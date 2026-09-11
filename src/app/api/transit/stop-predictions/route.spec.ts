import { beforeEach, describe, expect, it, vi } from "vitest";
import TRANSIT_TRIPS from "@/data/transit-trips.json";

const { getStopPredictionsResult } = vi.hoisted(() => ({
  getStopPredictionsResult: vi.fn(),
}));

vi.mock("@/lib/integrations/transitRealtime", () => ({
  getStopPredictionsResult,
}));

import { GET } from "./route";

describe("stop prediction API rider context", () => {
  beforeEach(() => {
    getStopPredictionsResult.mockReset();
  });

  it("joins the official trip headsign without changing realtime feed state", async () => {
    const [tripId, trip] = Object.entries(
      TRANSIT_TRIPS as Record<
        string,
        { routeId: string; directionId?: number; headsign?: string }
      >,
    ).find(([, value]) => value.headsign) ?? [];
    expect(tripId).toBeTruthy();
    expect(trip?.headsign).toBeTruthy();

    getStopPredictionsResult.mockResolvedValue({
      data: [
        {
          stopId: "162950",
          tripId,
          vehicleId: "bus-15",
          arrivalEpoch: 1_785_000_600,
          timestamp: 1_785_000_000,
        },
        {
          stopId: "different-stop",
          routeId: trip?.routeId,
          tripId,
        },
      ],
      status: "ok",
      available: true,
      feedTimestamp: 1_785_000_000,
      receivedAt: 1_785_000_010_000,
    });

    const response = await GET(
      new Request(
        "https://frederickradius.app/api/transit/stop-predictions?stop=162950",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      available: true,
      status: "ok",
      feedTimestamp: 1_785_000_000,
      predictions: [
        {
          stopId: "162950",
          tripId,
          routeId: trip?.routeId,
          headsign: trip?.headsign,
          directionId: trip?.directionId,
        },
      ],
    });
  });
});
