import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadEventArchiveSnapshot: vi.fn(),
}));

vi.mock("@/lib/loaders/todayEventSnapshot", () => ({
  loadEventArchiveSnapshot: mocks.loadEventArchiveSnapshot,
}));

import { dynamic, GET } from "./route";

function snapshot(
  state: "current" | "provider_partial" | "unavailable",
  degraded = state !== "current",
) {
  return {
    unified: [],
    publicEvents: [],
    sourceHealth: {
      degraded,
      unavailable: degraded ? ["event archive"] : [],
      archive: {
        state,
        status: state === "current" ? "ok" : state === "provider_partial" ? "partial" : null,
        finishedAt: state === "unavailable" ? null : "2026-08-14T12:00:00.000Z",
        recordsFailed: state === "current" ? 0 : state === "provider_partial" ? 1 : null,
        invalidSnapshots: 0,
      },
    },
  };
}

describe("GET /api/events/browse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cannot bake the no-database build fallback into production", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("keeps a current durable archive in the shared edge cache", async () => {
    mocks.loadEventArchiveSnapshot.mockResolvedValue(snapshot("current"));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=900",
    );
    expect(response.headers.get("x-radius-source-coverage")).toBe("complete");
  });

  it("does not let an archive timeout poison the shared event cache", async () => {
    mocks.loadEventArchiveSnapshot.mockResolvedValue(snapshot("unavailable"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("x-radius-source-coverage")).toBe("partial");
    expect(body.sourceHealth.archive.state).toBe("unavailable");
  });

  it("caches readable last-known-good rows while labeling provider gaps", async () => {
    mocks.loadEventArchiveSnapshot.mockResolvedValue(
      snapshot("provider_partial"),
    );

    const response = await GET();

    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=900",
    );
    expect(response.headers.get("x-radius-source-coverage")).toBe("partial");
  });
});
