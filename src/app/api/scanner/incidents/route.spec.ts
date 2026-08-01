import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGeocodedScannerIncidentsResult: vi.fn(),
}));

vi.mock("@/lib/integrations/scannerIncidents", () => ({
  getGeocodedScannerIncidentsResult:
    mocks.getGeocodedScannerIncidentsResult,
}));

import { GET } from "./route";

describe("GET /api/scanner/incidents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("distinguishes public reports from safely mapped reports", async () => {
    mocks.getGeocodedScannerIncidentsResult.mockResolvedValue({
      data: [],
      available: true,
      source: "direct",
      rawCount: 2,
      geocodedCount: 0,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      incidents: [],
      available: true,
      reportedCount: 2,
      mappedCount: 0,
      unmappedCount: 2,
    });
  });

  it("fails soft without presenting an unavailable source as quiet", async () => {
    mocks.getGeocodedScannerIncidentsResult.mockRejectedValue(
      new Error("source unavailable"),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      incidents: [],
      available: false,
      reportedCount: 0,
      mappedCount: 0,
      unmappedCount: 0,
    });
  });
});
