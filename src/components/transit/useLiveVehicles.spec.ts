import { afterEach, describe, expect, it, vi } from "vitest";

type VehiclesPayload = {
  vehicles: Array<{
    vehicleId: string;
    routeId?: string;
    lat: number;
    lng: number;
  }>;
  status: "ok" | "degraded" | "unavailable";
  available: boolean;
  feedTimestamp?: number;
  feeds?: {
    tripUpdates?: {
      available?: boolean;
    };
  };
};

type LiveVehiclesModule = typeof import("./useLiveVehicles");

let unsubscribe: (() => void) | undefined;

async function readLoadedSnapshot(
  payload: VehiclesPayload,
  responseStatus = 200,
) {
  vi.resetModules();

  let subscribed = false;
  const listener = vi.fn();
  vi.doMock("react", () => ({
    useSyncExternalStore: (
      subscribe: (callback: () => void) => () => void,
      getSnapshot: () => unknown,
    ) => {
      if (!subscribed) {
        unsubscribe = subscribe(listener);
        subscribed = true;
      }
      return getSnapshot();
    },
  }));

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        responseStatus === 200 ? JSON.stringify(payload) : null,
        {
          status: responseStatus,
          headers:
            responseStatus === 200
              ? { "content-type": "application/json" }
              : undefined,
        },
      ),
    ),
  );

  const live = (await import("./useLiveVehicles")) as LiveVehiclesModule;
  live.useLiveVehicles();

  await vi.waitFor(() => {
    expect(live.useLiveVehicles().loaded).toBe(true);
  });

  return live.useLiveVehicles();
}

afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  vi.unstubAllGlobals();
  vi.doUnmock("react");
  vi.resetModules();
});

describe("useLiveVehicles provider states", () => {
  it("marks an upstream failure unavailable instead of calling it an empty service", async () => {
    const snapshot = await readLoadedSnapshot(
      {
        vehicles: [],
        status: "unavailable",
        available: false,
      },
      503,
    );

    expect(snapshot).toMatchObject({
      vehicles: [],
      loaded: true,
      available: false,
      status: "unavailable",
      predictionsAvailable: false,
    });
  });

  it("preserves a healthy empty response as available with zero reporting buses", async () => {
    const now = Math.floor(Date.now() / 1000);
    const snapshot = await readLoadedSnapshot({
      vehicles: [],
      status: "ok",
      available: true,
      feedTimestamp: now,
      feeds: { tripUpdates: { available: true } },
    });

    expect(snapshot).toMatchObject({
      vehicles: [],
      loaded: true,
      available: true,
      status: "ok",
      predictionsAvailable: true,
      feedTimestamp: now,
      stale: false,
    });
  });

  it("keeps live positions while labeling missing arrival predictions degraded", async () => {
    const now = Math.floor(Date.now() / 1000);
    const snapshot = await readLoadedSnapshot({
      vehicles: [
        {
          vehicleId: "bus-15",
          routeId: "9349",
          lat: 39.414,
          lng: -77.411,
        },
      ],
      status: "degraded",
      available: true,
      feedTimestamp: now,
      feeds: { tripUpdates: { available: false } },
    });

    expect(snapshot).toMatchObject({
      loaded: true,
      available: true,
      status: "degraded",
      predictionsAvailable: false,
      feedTimestamp: now,
      stale: false,
    });
    expect(snapshot.vehicles).toHaveLength(1);
    expect(snapshot.vehicles[0].vehicleId).toBe("bus-15");
  });

  it("marks an old provider snapshot stale even when Radius receives HTTP 200", async () => {
    const snapshot = await readLoadedSnapshot({
      vehicles: [
        {
          vehicleId: "bus-old",
          routeId: "9349",
          lat: 39.414,
          lng: -77.411,
        },
      ],
      status: "ok",
      available: true,
      feedTimestamp: Math.floor((Date.now() - 120_000) / 1000),
      feeds: { tripUpdates: { available: true } },
    });

    expect(snapshot).toMatchObject({
      loaded: true,
      available: true,
      status: "ok",
      stale: true,
    });
  });
});
