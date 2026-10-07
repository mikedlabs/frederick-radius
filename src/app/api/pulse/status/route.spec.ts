import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSituationSnapshot } from "@/lib/live/currentSituationModel";
import {
  buildRoadIntelligenceSnapshot,
  type RoadIntelligenceSources,
} from "@/lib/live/roadIntelligenceModel";
import { MDOT_WZDX_SOURCE_URL } from "@/lib/integrations/mdot-wzdx";
import {
  CHART_ROAD_SOURCES,
  type ChartHighwayMessage,
} from "@/lib/integrations/mdot-road-feeds";

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

const ROAD_NOW = new Date("2026-10-07T03:03:00.000Z");

function quietRoadSources(): RoadIntelligenceSources {
  const asOf = ROAD_NOW.toISOString();
  return {
    workZones: {
      data: [],
      available: true,
      asOf,
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    },
    speeds: { data: [], available: true, asOf },
    travelTimes: { data: [], available: true, asOf },
    messages: { data: [], available: true, asOf },
    weatherStations: { data: [], available: true, asOf },
    roadConditions: { data: [], available: true, asOf },
    snowEmergency: { data: [], available: true, asOf },
  };
}

function road(sources: RoadIntelligenceSources = quietRoadSources()) {
  return buildRoadIntelligenceSnapshot({ sources, now: ROAD_NOW });
}

/** The sign text that lit every page header at 11:03 PM on Oct 6, 2026. */
const EXIT_76_ROADWORK = "ROADWORK AT EXIT 76 MD 97 2 LEFT LANES CLOSED";

function sign(
  overrides: Pick<ChartHighwayMessage, "id" | "location" | "lat" | "lng">,
): ChartHighwayMessage {
  return {
    message: EXIT_76_ROADWORK,
    observedAt: ROAD_NOW.toISOString(),
    beaconsEnabled: true,
    evidence: "device-observation",
    sourceUrl: CHART_ROAD_SOURCES.messages,
    ...overrides,
  };
}

describe("GET /api/pulse/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(road());
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

  it("counts a road closure at caution, matching the Advisory label on Pulse", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());
    const sources = quietRoadSources();
    sources.workZones.data = [
      {
        id: "wz-us15-north",
        road: "US 15",
        roadNames: ["US 15"],
        direction: "northbound",
        description: "Bridge deck repair",
        status: "active",
        startAt: "2026-10-06T23:00:00.000Z",
        endAt: null,
        updatedAt: ROAD_NOW.toISOString(),
        geometry: {
          type: "LineString",
          coordinates: [[-77.42, 39.41], [-77.41, 39.42]],
        },
        lanes: { total: 2, closed: 2, summary: "all-lanes-closed" },
        positionConfidence: "verified",
        sourceUrl: MDOT_WZDX_SOURCE_URL,
      },
    ];
    const closure = road(sources);
    expect(closure.attention[0]).toMatchObject({ severity: "warning" });
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(closure);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      active: true,
      count: 1,
      tone: "caution",
      ok: true,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });

  it("caps the Oct 6 roadwork sign at caution when the sign stands in the county", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());
    const sources = quietRoadSources();
    sources.messages.data = [
      sign({
        id: "dms-i70-e-62",
        location: "I-70 East at exit 62 MD 75",
        lat: 39.38,
        lng: -77.27,
      }),
    ];
    const roadwork = road(sources);
    // The road model still grades every actionable sign as a warning; the
    // header must not turn that into the red dot by itself.
    expect(roadwork.attention).toEqual([
      expect.objectContaining({
        kind: "highway-message",
        severity: "warning",
        title: EXIT_76_ROADWORK,
      }),
    ]);
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(roadwork);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      active: true,
      count: 1,
      tone: "caution",
      ok: true,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });

  it("does not count the Oct 6 roadwork sign when it stands outside the county", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());
    const sources = quietRoadSources();
    sources.messages.data = [
      sign({
        id: "dms-i70-w-76",
        location: "I-70 West prior to exit 76 MD 97",
        lat: 39.3,
        lng: -77.06,
      }),
    ];
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(road(sources));

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      active: false,
      count: 0,
      tone: "quiet",
      ok: true,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });

  it("keeps a declared snow emergency at the alert tone", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());
    const sources = quietRoadSources();
    sources.snowEmergency.data = [
      {
        id: "sep-frederick",
        county: "Frederick County",
        status: "active",
        declaredAt: "2026-10-07T02:00:00.000Z",
        liftedAt: null,
        exception: null,
        evidence: "official-declaration",
        sourceUrl: CHART_ROAD_SOURCES.snowEmergency,
      },
    ];
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(road(sources));

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      active: true,
      count: 1,
      tone: "alert",
      ok: true,
      lastUpdated: "2026-07-28T16:00:00.000Z",
    });
  });

  it("keeps a county alert red when a road advisory is also active", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(
      snapshot({ status: "active", tone: "alert", activeCount: 1 }),
    );
    const sources = quietRoadSources();
    sources.messages.data = [
      sign({
        id: "dms-i70-e-62",
        location: "I-70 East at exit 62 MD 75",
        lat: 39.38,
        lng: -77.27,
      }),
    ];
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(road(sources));

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      active: true,
      count: 2,
      tone: "alert",
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
