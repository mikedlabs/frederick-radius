import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AqiObservation } from "@/lib/integrations/airnow";
import type { FcpsAlert } from "@/lib/integrations/fcps";
import type { FrederickOutages } from "@/lib/integrations/firstenergy";
import type { ChartIncident } from "@/lib/integrations/mdot-chart";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { PulsePointIncident } from "@/lib/integrations/pulsepoint";
import type { GeocodedIncident } from "@/lib/integrations/scannerIncidents";
import {
  buildCurrentSituationSnapshot,
  sourceEnvelope,
  type CurrentSituationSnapshot,
  type CurrentSituationSources,
} from "@/lib/live/currentSituationModel";
import {
  buildRoadIntelligenceSnapshot,
  type RoadIntelligenceSources,
} from "@/lib/live/roadIntelligenceModel";
import { MDOT_WZDX_SOURCE_URL } from "@/lib/integrations/mdot-wzdx";
import {
  CHART_ROAD_SOURCES,
  type ChartHighwayMessage,
} from "@/lib/integrations/mdot-road-feeds";
import type { CivicPressItem } from "@/lib/integrations/civic-press";
import { FLOOD_STAGES } from "@/lib/integrations/floodStage";
import type { WaterSite, WaterSitesResult } from "@/lib/integrations/usgsWater";

const mocks = vi.hoisted(() => ({
  getCurrentSituationSnapshot: vi.fn(),
  getOfficialCivicAlertsSnapshot: vi.fn(),
  getOfficialStormReportsSnapshot: vi.fn(),
  getRoadIntelligenceSnapshot: vi.fn(),
  getCivicPressReleasesResult: vi.fn(),
  getFrederickWaterSitesWithHistoryResult: vi.fn(),
}));

vi.mock("@/lib/live/currentSituation", () => ({
  getCurrentSituationSnapshot: mocks.getCurrentSituationSnapshot,
}));

vi.mock("@/lib/live/officialSignals", () => ({
  getOfficialCivicAlertsSnapshot: mocks.getOfficialCivicAlertsSnapshot,
  getOfficialStormReportsSnapshot: mocks.getOfficialStormReportsSnapshot,
}));

vi.mock("@/lib/live/roadIntelligence", () => ({
  getRoadIntelligenceSnapshot: mocks.getRoadIntelligenceSnapshot,
}));

// Only the fetch is replaced: featuredPoliceRelease stays the real rule
// /pulse uses to pick its breaking strip.
vi.mock("@/lib/integrations/civic-press", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/civic-press")>()),
  getCivicPressReleasesResult: mocks.getCivicPressReleasesResult,
}));

vi.mock("@/lib/integrations/usgsWater", () => ({
  getFrederickWaterSitesWithHistoryResult: mocks.getFrederickWaterSitesWithHistoryResult,
}));

import { GET } from "./route";
import { pulseChipWord, type PulseStatus } from "@/components/nav/PulseIndicator";
import { pulseStatusWord } from "@/components/pulse/PulseBoard";
import { featuredPoliceRelease } from "@/lib/integrations/civic-press";
import { currentFloodCoverage } from "@/lib/integrations/floodStage";
import { countyStatusSentence, selectCountyStatus } from "@/lib/live/countyStatus";

const GENERATED_AT = "2026-07-28T16:00:00.000Z";

function envelope<T>(
  source: Parameters<typeof sourceEnvelope<T>>[0]["source"],
  data: T,
  options: Partial<Parameters<typeof sourceEnvelope<T>>[0]> = {},
) {
  return sourceEnvelope({
    source,
    data,
    availability: "available",
    requiredForQuiet: true,
    capturedAt: GENERATED_AT,
    staleAfterSeconds: 300,
    asOf: GENERATED_AT,
    asOfBasis: "retrieval",
    ...options,
  });
}

/** A real snapshot, so the route grades rows rather than a canned summary. */
function snapshot(
  overrides: Partial<CurrentSituationSources> = {},
): CurrentSituationSnapshot {
  return buildCurrentSituationSnapshot({
    sources: {
      weather: envelope<NwsAlert[]>("nws", []),
      schools: envelope<FcpsAlert[]>("fcps", []),
      traffic: envelope<ChartIncident[]>("mdot-chart", []),
      scanner: envelope<GeocodedIncident[]>("frederick-scanner", [], {
        requiredForQuiet: false,
      }),
      power: envelope<FrederickOutages>(
        "firstenergy",
        { total_out: 0, total_served: 100_000, munis: [] },
        { itemCount: 0 },
      ),
      fireRescue: envelope<PulsePointIncident[]>("pulsepoint", [], {
        availability: "disabled",
        requiredForQuiet: false,
        asOf: null,
        asOfBasis: null,
      }),
      air: envelope<AqiObservation[]>("airnow", []),
      ...overrides,
    },
    roadFusion: {
      incidents: [],
      matchedChartIncidentIds: [],
      unmatchedChartIncidentIds: [],
    },
    now: GENERATED_AT,
  });
}

/** The high-severity CHART crash behind the 11:03 PM red header dot. */
function crash(): ChartIncident {
  return {
    id: "chart-us15",
    type: "Incident",
    description: "Crash",
    county: "Frederick",
    road: "US 15",
    direction: "NB",
    location: "US 15 north at MD 26",
    lng: -77.4105,
    lat: 39.4143,
    started_at: "2026-07-28T15:50:00.000Z",
    severity: "High",
  };
}

const QUIET_FIELDS = { word: "All quiet", items: [] };

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

/** All six NWS forecast-point gauges, current and well below action stage. */
function gauges(heights: Record<string, number> = {}): WaterSite[] {
  return Object.keys(FLOOD_STAGES).map((id) => ({
    id,
    name: `GAUGE ${id}`,
    river: id === "01643000" ? "MONOCACY RIVER" : "TEST CREEK",
    gageHeightFt: heights[id] ?? 2,
    observedAt: "2026-07-28T15:45:00.000Z",
    floodStages: FLOOD_STAGES[id],
    municipality: "frederick",
    lng: -77.4,
    lat: 39.4,
  }));
}

function press(items: CivicPressItem[] = []) {
  return { items, sourceHealth: { degraded: false, unavailable: [] } };
}

/** A fresh City police release of the kind /pulse leads with as Urgent. */
function shootingRelease(): CivicPressItem {
  return {
    title: "Frederick Police investigating shooting on West Patrick Street",
    url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=901",
    source: "City of Frederick",
    sourceShort: "City",
    publishedAt: "2026-07-28T15:10:00.000Z",
    lane: "police",
  };
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
    mocks.getOfficialStormReportsSnapshot.mockResolvedValue({
      reports: [],
      available: true,
      degraded: false,
    });
    mocks.getCivicPressReleasesResult.mockResolvedValue(press());
    mocks.getFrederickWaterSitesWithHistoryResult.mockResolvedValue({
      data: gauges(),
      available: true,
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
      lastUpdated: GENERATED_AT,
      ...QUIET_FIELDS,
    });
  });

  it("grades the Oct 6 CHART crash amber, the Advisory /pulse showed", async () => {
    // At 11:03 PM the header dot was red while /pulse called the same crash
    // an Advisory. Both now read selectCountyStatus.
    mocks.getCurrentSituationSnapshot.mockResolvedValue(
      snapshot({ traffic: envelope("mdot-chart", [crash()]) }),
    );

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: true,
      count: 1,
      tone: "caution",
      word: "Advisory",
      ok: true,
      items: [
        expect.objectContaining({
          family: "roads",
          severity: "advisory",
          title: "Crash on US 15 North",
          href: "/pulse?open=traffic",
          towns: ["frederick"],
        }),
      ],
    });
  });

  it("reports active verified signals while preserving partial coverage", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(
      snapshot({
        weather: envelope<NwsAlert[]>("nws", [
          {
            id: "nws-tor",
            event: "Tornado Warning",
            headline: "Tornado Warning for Frederick County",
            description: "",
            severity: "Extreme",
            urgency: "Immediate",
            certainty: "Observed",
            starts_at: "2026-07-28T15:30:00.000Z",
            ends_at: "2026-07-28T17:00:00.000Z",
            area: "Frederick, MD",
            url: "https://api.weather.gov/alerts/nws-tor",
          },
        ]),
        traffic: envelope("mdot-chart", [crash()]),
        schools: envelope<FcpsAlert[]>("fcps", [], {
          availability: "unavailable",
          asOf: null,
        }),
      }),
    );

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: true,
      count: 2,
      tone: "alert",
      word: "Urgent",
      ok: false,
      lastUpdated: GENERATED_AT,
    });
  });

  it("says Unknown, not All quiet, when nothing is reported and a source failed", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());
    mocks.getRoadIntelligenceSnapshot.mockRejectedValue(new Error("timeout"));

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: false,
      count: 0,
      tone: "quiet",
      word: "Unknown",
      ok: false,
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

    await expect(response.json()).resolves.toMatchObject({
      active: true,
      count: 1,
      tone: "caution",
      word: "Advisory",
      ok: true,
      lastUpdated: GENERATED_AT,
    });
  });

  it("caps the Oct 6 roadwork sign at caution and writes it in sentence case", async () => {
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
        title: "Roadwork at exit 76, MD 97: two left lanes closed",
      }),
    ]);
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(roadwork);

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      active: true,
      count: 1,
      tone: "caution",
      ok: true,
      lastUpdated: GENERATED_AT,
      items: [
        expect.objectContaining({
          title: "Roadwork at exit 76, MD 97: two left lanes closed",
        }),
      ],
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
      lastUpdated: GENERATED_AT,
      ...QUIET_FIELDS,
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

    await expect(response.json()).resolves.toMatchObject({
      active: true,
      count: 1,
      tone: "alert",
      word: "Urgent",
      ok: true,
      lastUpdated: GENERATED_AT,
    });
  });

  it("keeps a county alert red when a road advisory is also active", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(
      snapshot({
        fireRescue: envelope<PulsePointIncident[]>("pulsepoint", [
          {
            id: "pp-1",
            type: "Structure Fire",
            severity: "severe",
            address: "100 block N Market St",
            received_at: "2026-07-28T15:55:00.000Z",
          },
        ], { requiredForQuiet: false }),
      }),
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

    const body = await response.json();
    expect(body).toMatchObject({ active: true, count: 2, tone: "alert", word: "Urgent" });
    // Worst first: the fire call leads the road sign.
    expect(body.items.map((item: { family: string }) => item.family)).toEqual([
      "fire-rescue",
      "roads",
    ]);
  });

  it("does not promote an unrelated statewide health notice as local", async () => {
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());
    mocks.getOfficialCivicAlertsSnapshot.mockResolvedValue({
      alerts: [
        {
          kind: "health-notice",
          title: "Measles exposure reported",
          summary: "The exposure locations are in Southern Maryland.",
          url: "https://health.frederickcountymd.gov/AlertCenter.aspx?AID=9",
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
      lastUpdated: GENERATED_AT,
      ...QUIET_FIELDS,
    });
  });
});

/**
 * The header chip and the /pulse masthead, built from the same evidence. The
 * page side is the call /pulse makes; the chip side is this route's payload
 * read through pulseChipWord. Review of 6a297ca9: only the page graded a
 * breaking police release or a river at flood stage, so the chip printed
 * "Quiet" directly above "Urgent: {release title}."
 */
describe("the header chip and the /pulse masthead read one list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentSituationSnapshot.mockResolvedValue(snapshot());
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(road());
    mocks.getOfficialCivicAlertsSnapshot.mockResolvedValue({
      alerts: [],
      available: true,
      degraded: false,
    });
    mocks.getOfficialStormReportsSnapshot.mockResolvedValue({
      reports: [],
      available: true,
      degraded: false,
    });
    mocks.getCivicPressReleasesResult.mockResolvedValue(press());
    mocks.getFrederickWaterSitesWithHistoryResult.mockResolvedValue({
      data: gauges(),
      available: true,
    });
  });

  /** What /pulse prints for the same inputs: the masthead word and the h1. */
  async function pulsePage() {
    const situation = await mocks.getCurrentSituationSnapshot();
    const now = new Date(situation.generatedAt);
    const rivers: WaterSitesResult = await mocks.getFrederickWaterSitesWithHistoryResult();
    const storms = await mocks.getOfficialStormReportsSnapshot();
    const flood = currentFloodCoverage(rivers.available, rivers.data, now);
    const status = selectCountyStatus({
      situation,
      road: await mocks.getRoadIntelligenceSnapshot(),
      civic: await mocks.getOfficialCivicAlertsSnapshot(),
      pulseOnly: {
        flood: flood.worst,
        police: featuredPoliceRelease(
          (await mocks.getCivicPressReleasesResult()).items,
          now.getTime(),
        ),
        complete: flood.status === "current" && storms.available,
      },
    });
    // pulseUrgentFeedsDegraded: a river check that is not current or a storm
    // report feed that did not answer keeps /pulse partial.
    const degraded = flood.status !== "current" || !storms.available;
    return {
      word: pulseStatusWord({
        allClear: status.count === 0 && !degraded,
        degraded,
        hasLead: status.count > 0,
        tone: status.tone === "alert" ? "danger" : "warning",
        status,
      }),
      headline: countyStatusSentence(status),
    };
  }

  async function chip() {
    const body = (await (await GET()).json()) as PulseStatus & { word: string; items: unknown[] };
    return { body, word: pulseChipWord(body, "ready") };
  }

  it("grades a fresh police release Urgent in the chip, as the masthead does", async () => {
    mocks.getCivicPressReleasesResult.mockResolvedValue(press([shootingRelease()]));

    const { body, word } = await chip();
    const page = await pulsePage();

    expect(body).toMatchObject({ active: true, count: 1, tone: "alert", word: "Urgent", ok: true });
    expect(word).toBe("Urgent");
    expect(page.word).toBe(word);
    expect(page.headline).toBe(
      "Urgent: Frederick Police investigating shooting on West Patrick Street.",
    );
  });

  it("grades a river at flood stage in the chip with the title /pulse prints", async () => {
    mocks.getFrederickWaterSitesWithHistoryResult.mockResolvedValue({
      data: gauges({ "01643000": 15.5 }),
      available: true,
    });

    const { body, word } = await chip();
    const page = await pulsePage();

    expect(body.items).toEqual([
      expect.objectContaining({
        family: "water",
        severity: "urgent",
        title: "Monocacy River minor flooding",
        href: "/pulse?open=rivers",
      }),
    ]);
    expect(word).toBe("Urgent");
    expect(page.word).toBe(word);
    expect(page.headline).toBe("Urgent: Monocacy River minor flooding.");
  });

  it("keeps a quiet county Quiet when the only police release is older than the strip's window", async () => {
    mocks.getCivicPressReleasesResult.mockResolvedValue(
      press([{ ...shootingRelease(), publishedAt: "2026-07-28T08:00:00.000Z" }]),
    );

    const { body, word } = await chip();
    const page = await pulsePage();

    expect(body).toMatchObject({ active: false, ok: true, word: "All quiet" });
    expect(word).toBe("Quiet");
    expect(page.word).toBe("All quiet");
  });

  it.each([
    [
      "the river gauges did not answer",
      () =>
        mocks.getFrederickWaterSitesWithHistoryResult.mockResolvedValue({
          data: [],
          available: false,
        }),
    ],
    [
      "the NWS storm reports did not answer",
      () =>
        mocks.getOfficialStormReportsSnapshot.mockResolvedValue({
          reports: [],
          available: false,
          degraded: true,
        }),
    ],
  ])("says Unknown, never Quiet, when %s and /pulse says Partial data", async (_label, fail) => {
    fail();

    const { body, word } = await chip();
    const page = await pulsePage();

    expect(body).toMatchObject({ active: false, ok: false, word: "Unknown" });
    expect(word).toBe("Unknown");
    expect(page.word).toBe("Partial data");
  });

  it("answers within the feed bound when the press feed never responds", async () => {
    vi.useFakeTimers();
    try {
      mocks.getCivicPressReleasesResult.mockReturnValue(new Promise(() => {}));
      const pending = GET();
      await vi.advanceTimersByTimeAsync(6_000);
      const body = await (await pending).json();
      // /pulse shows no breaking strip without the feed either; its police
      // tile names the outage instead.
      expect(body).toMatchObject({ active: false, ok: true, word: "All quiet" });
    } finally {
      vi.useRealTimers();
    }
  });
});
