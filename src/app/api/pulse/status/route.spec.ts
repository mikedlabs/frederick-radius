import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligenceModel";
import { MDOT_WZDX_SOURCE_URL } from "@/lib/integrations/mdot-wzdx";
import type { CountyStatusSummary } from "@/lib/pulse/county-status";
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

const NOW = "2026-07-28T16:00:00.000Z";
function checkedRoadSnapshot() {
  const feed = { available: true, data: [], asOf: NOW, checkedAt: NOW };
  return buildRoadIntelligenceSnapshot({ now: new Date(NOW), sources: {
    workZones: { ...feed, sourceUrl: MDOT_WZDX_SOURCE_URL },
    speeds: { ...feed }, travelTimes: { ...feed }, messages: { ...feed },
    weatherStations: { ...feed }, roadConditions: { ...feed }, snowEmergency: { ...feed },
  } });
}

/** Existing consumers retain their exact core contract while the source
 * provenance is additive and independently asserted at the HTTP boundary. */
async function legacyStatus(response: Response, currentRoadCount = 0) {
  const { checks, roadCheck, ...core }: CountyStatusSummary = await response.json();
  expect(checks).toHaveLength(10);
  expect(checks).toContainEqual({ source: "NWS", state: "current", asOf: NOW, asOfBasis: "retrieval" });
  expect(checks).toContainEqual({ source: "Maryland WZDx", state: "current", asOf: NOW, asOfBasis: "retrieval" });
  expect(roadCheck).toEqual({ verified: true, checkedAt: NOW, currentCount: currentRoadCount, earlierCount: 0, unverifiedSources: [] });
  return core;
}

describe("GET /api/pulse/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(checkedRoadSnapshot());
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
    expect(await legacyStatus(response)).toEqual({
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
    expect(await legacyStatus(response)).toEqual({
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
    const road = checkedRoadSnapshot();
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue({ ...road,
      summary: { ...road.summary, status: "active", activeCount: 1 },
      attention: [{
        id: "test-closure", kind: "work-zone-closure", priority: 55,
        severity: "warning", title: "County route closure", detail: "All lanes closed.",
        scope: "County route", sourceLabel: "Maryland WZDx", sourceUrl: MDOT_WZDX_SOURCE_URL,
        observedAt: NOW,
      }],
    });

    const response = await GET();

    expect(await legacyStatus(response, 1)).toEqual({
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

    expect(await legacyStatus(response)).toEqual({
      active: false,
      count: 0,
      tone: "quiet",
      level: "Clear",
      ok: true,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });
});
