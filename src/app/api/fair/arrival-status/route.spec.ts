import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFairArrivalStatus: vi.fn(),
}));

vi.mock("@/lib/fair/arrival-status-live", () => ({
  getFairArrivalStatus: mocks.getFairArrivalStatus,
}));

import { GET } from "./route";

function status() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-18T16:00:00.000Z",
    state: "no-current-update",
    coverage: "configured-sources-current",
    headline: "No major arrival update is published in the feeds Radius checked.",
    summary:
      "This describes only the official feeds Radius checked. It is not an all-clear.",
    signals: [],
    hiddenSignalCount: 0,
    sources: [],
    transit: null,
    limitsLabel:
      "Official feeds do not measure Fair attendance, parking-space availability, or gate waits.",
  };
}

describe("GET /api/fair/arrival-status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getFairArrivalStatus.mockResolvedValue(status());
  });

  it("rejects dates outside the reviewed 2026 Fair window", async () => {
    const response = await GET(
      new Request(
        "https://frederickradius.app/api/fair/arrival-status?date=2026-09-02",
      ),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getFairArrivalStatus).not.toHaveBeenCalled();
  });

  it("returns a short coalesced official overview without transit", async () => {
    const response = await GET(
      new Request(
        "https://frederickradius.app/api/fair/arrival-status?date=2026-09-18",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=60",
    );
    expect(mocks.getFairArrivalStatus).toHaveBeenCalledWith({
      selectedDate: "2026-09-18",
      includeTransit: false,
    });
    await expect(response.json()).resolves.toEqual(status());
  });

  it("starts the narrower live-transit read only for transit mode", async () => {
    const response = await GET(
      new Request(
        "https://frederickradius.app/api/fair/arrival-status?date=2026-09-18&mode=transit",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("vercel-cdn-cache-control")).toBe(
      "public, s-maxage=15, stale-while-revalidate=30",
    );
    expect(mocks.getFairArrivalStatus).toHaveBeenCalledWith({
      selectedDate: "2026-09-18",
      includeTransit: true,
    });
  });

  it("rejects unsupported modes without touching providers", async () => {
    const response = await GET(
      new Request(
        "https://frederickradius.app/api/fair/arrival-status?date=2026-09-18&mode=crowds",
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.getFairArrivalStatus).not.toHaveBeenCalled();
  });
});
