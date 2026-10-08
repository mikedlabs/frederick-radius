import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCurrentSituationSnapshot, sourceEnvelope, type CurrentSituationSnapshot, type CurrentSituationSources } from "@/lib/live/currentSituationModel";

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
  const now = "2026-07-28T16:00:00.000Z";
  const envelope = <T,>(source: Parameters<typeof sourceEnvelope<T>>[0]["source"], data: T) => sourceEnvelope({
    source, data, availability: "available", requiredForQuiet: true,
    capturedAt: now, asOf: now, asOfBasis: "retrieval", staleAfterSeconds: 300,
  });
  const sources: CurrentSituationSources = {
    weather: envelope("nws", []),
    schools: envelope("fcps", []),
    traffic: envelope("mdot-chart", []),
    scanner: envelope("frederick-scanner", []),
    power: envelope("firstenergy", { total_out: 0, total_served: 100_000, munis: [] }),
    fireRescue: envelope("pulsepoint", []),
    air: envelope("airnow", []),
  };
  const current = buildCurrentSituationSnapshot({
    sources,
    roadFusion: { incidents: [], matchedChartIncidentIds: [], unmatchedChartIncidentIds: [] },
    now,
  });
  return { ...current, summary: { ...current.summary, ...overrides } };
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
      level: "Clear",
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
      tone: "caution",
      level: "Advisory",
      ok: false,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });

  it("keeps a warning-grade road closure advisory, matching Pulse", async () => {
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
      tone: "caution",
      level: "Advisory",
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
      level: "Clear",
      ok: true,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });
});
