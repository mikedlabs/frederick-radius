import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSituationSnapshot } from "@/lib/live/currentSituationModel";

const mocks = vi.hoisted(() => ({
  getCurrentSituationSnapshot: vi.fn(),
}));

vi.mock("@/lib/live/currentSituation", () => ({
  getCurrentSituationSnapshot: mocks.getCurrentSituationSnapshot,
}));

import { GET } from "./route";

describe("GET /api/pulse/incidents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the safe legacy snapshot with additive source health", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue({
      roads: {
        live: {
          items: [],
          totalCount: 0,
          corroboratedCount: 0,
          chartAvailable: false,
          scannerAvailable: false,
          updatedAt: "2026-07-28T16:00:00.000Z",
        },
      },
    } as unknown as CurrentSituationSnapshot);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=30, stale-while-revalidate=60",
    );
    await expect(response.json()).resolves.toEqual({
      items: [],
      totalCount: 0,
      corroboratedCount: 0,
      chartAvailable: false,
      scannerAvailable: false,
      updatedAt: "2026-07-28T16:00:00.000Z",
    });
  });
});
