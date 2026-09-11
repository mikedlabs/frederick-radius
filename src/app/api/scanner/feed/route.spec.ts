import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getScannerIncidentsResult: vi.fn(),
}));

vi.mock("@/lib/integrations/scannerIncidents", () => ({
  getScannerIncidentsResult: mocks.getScannerIncidentsResult,
}));

import { GET } from "./route";

describe("GET /api/scanner/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a verified quiet feed distinct from an outage", async () => {
    mocks.getScannerIncidentsResult.mockResolvedValue({
      data: [],
      available: true,
      source: "direct",
      asOf: "2026-08-27T14:00:00.000Z",
      asOfBasis: "retrieval",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "available",
      incidents: [],
      source: "direct",
      reason: null,
    });
  });

  it("returns explicit 503 timeout evidence instead of a generic empty 200", async () => {
    mocks.getScannerIncidentsResult.mockResolvedValue({
      data: [],
      available: false,
      source: "rss",
      reason: "timeout",
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      incidents: [],
      source: "rss",
      reason: "timeout",
    });
  });
});
