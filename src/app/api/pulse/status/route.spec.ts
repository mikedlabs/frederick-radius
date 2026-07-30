import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSituationSnapshot } from "@/lib/live/currentSituationModel";

const mocks = vi.hoisted(() => ({
  getCurrentSituationSnapshot: vi.fn(),
  getOfficialCivicAlertsSnapshot: vi.fn(),
  getRoadIntelligenceSnapshot: vi.fn(),
}));

vi.mock("@/lib/live/currentSituation", () => ({
  getCurrentSituationSnapshot: mocks.getCurrentSituationSnapshot,
}));

vi.mock("@/lib/live/officialSignals", () => ({
  getOfficialCivicAlertsSnapshot: mocks.getOfficialCivicAlertsSnapshot,
}));

vi.mock("@/lib/live/roadIntelligence", () => ({
  getRoadIntelligenceSnapshot: mocks.getRoadIntelligenceSnapshot,
}));

import { GET } from "./route";

function snapshot(
  overrides: Partial<CurrentSituationSnapshot["summary"]> = {},
): CurrentSituationSnapshot {
  return {
    generatedAt: "2026-07-28T16:00:00.000Z",
    summary: {
      status: "quiet",
      coverage: "complete",
      tone: "quiet",
      activeCount: 0,
      activeByCategory: {
        weather: 0,
        schools: 0,
        roads: 0,
        power: 0,
        fireRescue: 0,
        air: 0,
      },
      degradedSources: [],
      ...overrides,
    },
  } as CurrentSituationSnapshot;
}

describe("GET /api/pulse/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue({
      summary: {
        activeCount: 0,
        coverage: "complete",
      },
      attention: [],
    });
    mocks.getOfficialCivicAlertsSnapshot.mockResolvedValue({
      alerts: [],
      available: true,
      degraded: false,
    });
  });

  it("preserves the legacy status response and cache contract", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=300",
    );
    await expect(response.json()).resolves.toEqual({
      active: false,
      count: 0,
      tone: "quiet",
      ok: true,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });

  it("reports active verified signals while preserving partial coverage", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(
      snapshot({
        status: "active",
        coverage: "partial",
        tone: "alert",
        activeCount: 2,
        degradedSources: ["fcps"],
      }),
    );

    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      active: true,
      count: 2,
      tone: "alert",
      ok: false,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });

  it("counts an urgent road closure shown on Pulse", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue({
      summary: {
        activeCount: 1,
        coverage: "complete",
      },
      attention: [
        {
          severity: "warning",
        },
      ],
    });

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      active: true,
      count: 1,
      tone: "alert",
      ok: true,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });

  it("does not promote an unrelated statewide health notice as local", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());
    mocks.getOfficialCivicAlertsSnapshot.mockResolvedValue({
      alerts: [
        {
          kind: "health-notice",
          title: "Measles exposure reported",
          summary: "The exposure locations are in Southern Maryland.",
        },
      ],
      available: true,
      degraded: false,
    });

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      active: false,
      count: 0,
      tone: "quiet",
      ok: true,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });
});
