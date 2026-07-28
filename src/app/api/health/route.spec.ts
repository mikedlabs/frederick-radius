import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCachedPublicHealthSnapshot: vi.fn(),
}));

vi.mock("@/lib/public-health", () => ({
  getCachedPublicHealthSnapshot: mocks.getCachedPublicHealthSnapshot,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a non-cacheable public operational snapshot", async () => {
    mocks.getCachedPublicHealthSnapshot.mockResolvedValue({
      service: "frederick-radius",
      status: "operational",
      generatedAt: "2026-07-28T16:00:00.000Z",
      deployment: { environment: "production", revision: "abcdef012345" },
      database: { status: "reachable", latencyMs: 18 },
      data: {
        status: "current",
        tracked: 10,
        current: 10,
        stale: 0,
        attention: 0,
        unknown: 0,
        lastPublishedAt: "2026-07-28T15:55:00.000Z",
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, max-age=0",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({
      service: "frederick-radius",
      status: "operational",
      database: { status: "reachable" },
    });
  });
});
