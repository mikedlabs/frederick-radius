import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadTodayEventSnapshot: vi.fn(),
  selectTodayEvents: vi.fn(),
}));

vi.mock("@/lib/loaders/todayEventSnapshot", () => ({
  loadTodayEventSnapshot: mocks.loadTodayEventSnapshot,
}));
vi.mock("@/lib/today-events", () => ({
  selectTodayEvents: mocks.selectTodayEvents,
}));

import { dynamic, GET } from "./route";

function snapshot(
  state: "current" | "provider_partial",
  degraded = state !== "current",
) {
  return {
    unified: [],
    publicEvents: [],
    sourceHealth: {
      degraded,
      unavailable: degraded ? ["event archive providers"] : [],
      archive: {
        state,
        status: state === "current" ? "ok" : "partial",
        finishedAt: "2026-08-14T12:00:00.000Z",
        recordsFailed: state === "current" ? 0 : 1,
        invalidSnapshots: 0,
      },
    },
  };
}

describe("GET /api/today/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectTodayEvents.mockReturnValue([]);
  });

  it("cannot bake the no-database build fallback into production", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("caches a current durable Today snapshot", async () => {
    mocks.loadTodayEventSnapshot.mockResolvedValue(snapshot("current"));

    const response = await GET();
    const body = await response.json();

    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=900",
    );
    expect(response.headers.get("x-radius-source-coverage")).toBe("complete");
    expect(body.partial).toBe(false);
  });

  it("keeps a loader failure out of the shared Today cache", async () => {
    mocks.loadTodayEventSnapshot.mockRejectedValue(new Error("database timeout"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("x-radius-source-coverage")).toBe("partial");
    expect(body.partial).toBe(true);
  });

  it("caches readable last-known-good rows while preserving partial status", async () => {
    mocks.loadTodayEventSnapshot.mockResolvedValue(
      snapshot("provider_partial"),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=900",
    );
    expect(response.headers.get("x-radius-source-coverage")).toBe("partial");
    expect(body.partial).toBe(true);
  });
});
