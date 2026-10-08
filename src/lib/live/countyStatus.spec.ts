import { describe, expect, it } from "vitest";
import type { AqiObservation } from "@/lib/integrations/airnow";
import type { FcpsAlert } from "@/lib/integrations/fcps";
import type { FrederickOutages } from "@/lib/integrations/firstenergy";
import type { ChartIncident } from "@/lib/integrations/mdot-chart";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { OfficialCivicAlert } from "@/lib/integrations/official-alert-feeds";
import type { PulsePointIncident } from "@/lib/integrations/pulsepoint";
import type { GeocodedIncident } from "@/lib/integrations/scannerIncidents";
import { MDOT_WZDX_SOURCE_URL } from "@/lib/integrations/mdot-wzdx";
import { CHART_ROAD_SOURCES } from "@/lib/integrations/mdot-road-feeds";
import {
  buildCurrentSituationSnapshot,
  sourceEnvelope,
  type CurrentSituationSources,
} from "./currentSituationModel";
import {
  buildRoadIntelligenceSnapshot,
  type RoadIntelligenceSources,
} from "./roadIntelligenceModel";
import {
  countyStatusDetailKey,
  countyStatusFromItems,
  countyStatusSentence,
  floodStatusItem,
  policeStatusItem,
  selectCountyStatus,
  townsAt,
  type CountyStatusItem,
} from "./countyStatus";

const NOW = "2026-10-07T03:03:00.000Z";

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
    capturedAt: NOW,
    staleAfterSeconds: 300,
    asOf: NOW,
    asOfBasis: "retrieval",
    ...options,
  });
}

function situation(overrides: Partial<CurrentSituationSources> = {}) {
  const outages: FrederickOutages = { total_out: 0, total_served: 100_000, munis: [] };
  return buildCurrentSituationSnapshot({
    sources: {
      weather: envelope<NwsAlert[]>("nws", []),
      schools: envelope<FcpsAlert[]>("fcps", []),
      traffic: envelope<ChartIncident[]>("mdot-chart", []),
      scanner: envelope<GeocodedIncident[]>("frederick-scanner", [], {
        requiredForQuiet: false,
      }),
      power: envelope<FrederickOutages>("firstenergy", outages, { itemCount: 0 }),
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
    now: NOW,
  });
}

function roadSources(): RoadIntelligenceSources {
  return {
    workZones: { data: [], available: true, asOf: NOW, sourceUrl: MDOT_WZDX_SOURCE_URL },
    speeds: { data: [], available: true, asOf: NOW },
    travelTimes: { data: [], available: true, asOf: NOW },
    messages: { data: [], available: true, asOf: NOW },
    weatherStations: { data: [], available: true, asOf: NOW },
    roadConditions: { data: [], available: true, asOf: NOW },
    snowEmergency: { data: [], available: true, asOf: NOW },
  };
}

const quietRoad = () =>
  buildRoadIntelligenceSnapshot({ sources: roadSources(), now: new Date(NOW) });
const quietCivic = { alerts: [], available: true, degraded: false };

/** The CHART crash behind the 11:03 PM header: red dot, "Advisory" on /pulse. */
function crash(overrides: Partial<ChartIncident> = {}): ChartIncident {
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
    started_at: "2026-10-07T02:50:00.000Z",
    severity: "High",
    ...overrides,
  };
}

function nws(overrides: Partial<NwsAlert> = {}): NwsAlert {
  return {
    id: "nws-1",
    event: "Heat Advisory",
    headline: "Heat Advisory in effect",
    description: "Heat index values up to 105.",
    severity: "Moderate",
    urgency: "Expected",
    certainty: "Likely",
    starts_at: "2026-10-07T00:00:00.000Z",
    ends_at: "2026-10-07T23:00:00.000Z",
    area: "Frederick, MD",
    url: "https://api.weather.gov/alerts/nws-1",
    ...overrides,
  };
}

function civic(overrides: Partial<OfficialCivicAlert> = {}): OfficialCivicAlert {
  return {
    id: "city-1",
    kind: "city-emergency",
    title: "Water main break closes Market Street",
    summary: "Avoid North Market Street in Frederick.",
    url: "https://www.cityoffrederickmd.gov/AlertCenter.aspx?AID=1",
    scope: "city",
    state: "active",
    active: true,
    publishedAt: NOW,
    occurredAt: null,
    expiresAt: null,
    confidence: "official",
    provenance: {} as OfficialCivicAlert["provenance"],
    ...overrides,
  } as OfficialCivicAlert;
}

describe("selectCountyStatus", () => {
  it("grades the Oct 6 CHART crash as an Advisory, the word /pulse used", () => {
    const status = selectCountyStatus({
      situation: situation({ traffic: envelope("mdot-chart", [crash()]) }),
      road: quietRoad(),
      civic: quietCivic,
    });

    expect(status).toMatchObject({
      word: "Advisory",
      tone: "caution",
      count: 1,
      ok: true,
      lastUpdated: NOW,
    });
    expect(status.items[0]).toMatchObject({
      family: "roads",
      severity: "advisory",
      title: "Crash on US 15 North",
      href: "/pulse?open=traffic",
    });
    // The incident's own position places it on a road through Frederick.
    expect(status.items[0].towns).toContain("frederick");
  });

  it("keeps the snapshot summary on the same severity rules", () => {
    const snapshot = situation({ traffic: envelope("mdot-chart", [crash()]) });
    expect(snapshot.summary.tone).toBe("caution");
  });

  it("paints a dangerous-weather warning urgent and a heat advisory amber", () => {
    const warning = selectCountyStatus({
      situation: situation({
        weather: envelope("nws", [
          nws({
            id: "nws-tor",
            event: "Tornado Warning",
            headline: "Tornado Warning",
            severity: "Extreme",
          }),
        ]),
      }),
      road: quietRoad(),
      civic: quietCivic,
    });
    expect(warning).toMatchObject({ word: "Urgent", tone: "alert" });

    const advisory = selectCountyStatus({
      situation: situation({ weather: envelope("nws", [nws()]) }),
      road: quietRoad(),
      civic: quietCivic,
    });
    expect(advisory).toMatchObject({ word: "Advisory", tone: "caution" });
    expect(advisory.items[0]).toMatchObject({
      title: "Heat Advisory",
      href: "/pulse?open=alerts",
    });
  });

  it("grades a power outage by its share of the county, as /pulse does", () => {
    const large = selectCountyStatus({
      situation: situation({
        power: envelope<FrederickOutages>(
          "firstenergy",
          { total_out: 1_204, total_served: 100_000, munis: [] },
          { itemCount: 1 },
        ),
      }),
      road: quietRoad(),
      civic: quietCivic,
    });
    expect(large).toMatchObject({ word: "Urgent", count: 1 });
    expect(large.items[0].title).toBe("1,204 customers without power");

    const small = selectCountyStatus({
      situation: situation({
        power: envelope<FrederickOutages>(
          "firstenergy",
          { total_out: 30, total_served: 100_000, munis: [] },
          { itemCount: 1 },
        ),
      }),
      road: quietRoad(),
      civic: quietCivic,
    });
    expect(small).toMatchObject({ word: "Advisory", tone: "caution" });
  });

  it("says Unknown, never All quiet, when nothing is reported and a source is missing", () => {
    const missing = selectCountyStatus({
      situation: situation(),
      road: null,
      civic: quietCivic,
    });
    expect(missing).toMatchObject({ word: "Unknown", tone: "quiet", count: 0, ok: false });

    const quiet = selectCountyStatus({
      situation: situation(),
      road: quietRoad(),
      civic: quietCivic,
    });
    expect(quiet).toMatchObject({ word: "All quiet", tone: "quiet", count: 0, ok: true });
  });

  it("keeps a reported item in front even when another source is down", () => {
    const status = selectCountyStatus({
      situation: situation({ traffic: envelope("mdot-chart", [crash()]) }),
      road: quietRoad(),
      civic: null,
    });
    expect(status).toMatchObject({ word: "Advisory", count: 1, ok: false });
  });

  it("makes a City emergency urgent and leaves a statewide health notice out", () => {
    const status = selectCountyStatus({
      situation: situation(),
      road: quietRoad(),
      civic: {
        alerts: [
          civic(),
          civic({
            id: "health-1",
            kind: "health-notice",
            title: "Measles exposure reported",
            summary: "The exposure locations are in Southern Maryland.",
            url: "https://health.frederickcountymd.gov/AlertCenter.aspx?AID=2",
          }),
        ],
        available: true,
        degraded: false,
      },
    });
    expect(status).toMatchObject({ word: "Urgent", tone: "alert", count: 1 });
    expect(status.items[0]).toMatchObject({
      family: "civic",
      title: "Water main break closes Market Street",
    });
  });

  it("does not count a highway sign that stands outside the county", () => {
    const sources = roadSources();
    sources.messages.data = [
      {
        id: "dms-i70-w-76",
        location: "I-70 West prior to exit 76 MD 97",
        message: "ROADWORK AT EXIT 76 MD 97 2 LEFT LANES CLOSED",
        lat: 39.3,
        lng: -77.06,
        observedAt: NOW,
        beaconsEnabled: true,
        evidence: "device-observation",
        sourceUrl: CHART_ROAD_SOURCES.messages,
      },
    ];
    const status = selectCountyStatus({
      situation: situation(),
      road: buildRoadIntelligenceSnapshot({ sources, now: new Date(NOW) }),
      civic: quietCivic,
    });
    expect(status).toMatchObject({ word: "All quiet", count: 0 });
  });

  it("places a work-zone closure in the towns its geometry crosses", () => {
    const sources = roadSources();
    sources.workZones.data = [
      {
        id: "wz-us340",
        road: "US 340",
        roadNames: ["US 340"],
        direction: "eastbound",
        description: "Bridge deck repair",
        status: "active",
        startAt: "2026-10-06T23:00:00.000Z",
        endAt: null,
        updatedAt: NOW,
        geometry: {
          type: "LineString",
          coordinates: [[-77.64, 39.31], [-77.62, 39.315]],
        },
        lanes: { total: 2, closed: 2, summary: "all-lanes-closed" },
        positionConfidence: "verified",
        sourceUrl: MDOT_WZDX_SOURCE_URL,
      },
    ];
    const status = selectCountyStatus({
      situation: situation(),
      road: buildRoadIntelligenceSnapshot({ sources, now: new Date(NOW) }),
      civic: quietCivic,
    });
    expect(status.items[0]).toMatchObject({
      family: "roads",
      severity: "advisory",
      title: "US 340 work-zone closure",
    });
    expect(status.items[0].towns).toContain("brunswick");
    expect(status.items[0].towns).not.toContain("thurmont");
  });

  it("keeps a declared snow emergency urgent", () => {
    const sources = roadSources();
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
    const status = selectCountyStatus({
      situation: situation(),
      road: buildRoadIntelligenceSnapshot({ sources, now: new Date(NOW) }),
      civic: quietCivic,
    });
    expect(status).toMatchObject({ word: "Urgent", tone: "alert", count: 1 });
  });

  it("grades Pulse-only river and police evidence with the same rules", () => {
    const status = selectCountyStatus({
      situation: situation(),
      road: quietRoad(),
      civic: quietCivic,
      extraItems: [
        floodStatusItem({ id: "01643000", title: "Monocacy River near flood stage", tone: "warning" }),
      ],
    });
    expect(status).toMatchObject({ word: "Advisory", count: 1 });
    expect(status.items[0].href).toBe("/pulse?open=rivers");

    expect(
      policeStatusItem({ url: "https://example.org/release", title: "Missing person" }),
    ).toMatchObject({ family: "police", severity: "urgent", href: "/pulse?open=police" });
  });
});

describe("countyStatusFromItems", () => {
  const item = (overrides: Partial<CountyStatusItem>): CountyStatusItem => ({
    id: "x",
    family: "roads",
    severity: "advisory",
    title: "Crash on I-70 East",
    href: "/pulse?open=traffic",
    ...overrides,
  });

  it("puts urgent items first, then the /pulse family order, and counts each id once", () => {
    const status = countyStatusFromItems(
      [
        item({ id: "road" }),
        item({ id: "school", family: "schools", title: "FCPS delayed opening" }),
        item({ id: "fire", family: "fire-rescue", severity: "urgent", title: "Structure Fire" }),
        item({ id: "road" }),
      ],
      { ok: true, lastUpdated: NOW },
    );
    expect(status.items.map((entry) => entry.id)).toEqual(["fire", "school", "road"]);
    expect(status).toMatchObject({ count: 3, word: "Urgent", tone: "alert" });
  });
});

describe("county status map points", () => {
  function workZone(coordinates: Array<[number, number]>) {
    const sources = roadSources();
    sources.workZones.data = [
      {
        id: "wz-md75",
        road: "MD 75",
        roadNames: ["MD 75"],
        direction: "northbound",
        description: "MD 75 NORTH BETWEEN BALTO NATIONAL PIKE AND FINGERBOARD RD",
        status: "active",
        startAt: "2026-10-06T23:00:00.000Z",
        endAt: null,
        updatedAt: NOW,
        geometry: { type: "LineString", coordinates },
        lanes: { total: 1, closed: 1, summary: "all-lanes-closed" },
        positionConfidence: "approximate",
        sourceUrl: MDOT_WZDX_SOURCE_URL,
      },
    ];
    return selectCountyStatus({
      situation: situation(),
      road: buildRoadIntelligenceSnapshot({ sources, now: new Date(NOW) }),
      civic: quietCivic,
    });
  }

  it("places a CHART incident at its own coordinates and names the source and time", () => {
    const status = selectCountyStatus({
      situation: situation({ traffic: envelope("mdot-chart", [crash()]) }),
      road: quietRoad(),
      civic: quietCivic,
    });
    expect(status.items[0]).toMatchObject({
      point: { lng: -77.4105, lat: 39.4143 },
      source: "MDOT CHART",
      seen: { at: "2026-10-07T02:50:00.000Z", verb: "Reported" },
      detail: "A crash is blocking lanes.",
    });
  });

  it("drops the point of an incident outside the county instead of pulling it to the line", () => {
    const status = selectCountyStatus({
      situation: situation({
        traffic: envelope("mdot-chart", [crash({ id: "chart-pa", lng: -77.41, lat: 39.8 })]),
      }),
      road: quietRoad(),
      civic: quietCivic,
    });
    // The feed still files it under Frederick, so it still counts; it simply
    // has no place on the county map.
    expect(status.count).toBe(1);
    expect(status.items[0].point).toBeUndefined();
  });

  it("puts a work zone on one of its own in-county vertices", () => {
    // The first vertex sits across the Potomac in Virginia.
    const status = workZone([[-77.63, 39.25], [-77.64, 39.31], [-77.62, 39.315]]);
    expect(status.items[0]).toMatchObject({
      title: "MD 75 work-zone closure",
      source: "Maryland WZDx",
      seen: { at: NOW, verb: "Observed" },
    });
    expect(status.items[0].point).toEqual({ lng: -77.64, lat: 39.31 });
  });

  it("gives a work zone no point when none of its vertices is in the county", () => {
    const status = workZone([[-77.63, 39.25], [-77.8, 39.5]]);
    expect(status.count).toBe(1);
    expect(status.items[0].point).toBeUndefined();
  });

  it("never locates a message sign, even one standing inside the county", () => {
    const sources = roadSources();
    sources.messages.data = [
      {
        id: "dms-i70-e-52",
        location: "I-70 East prior to exit 52 US 15",
        message: "ROADWORK AT EXIT 76 MD 97 RIGHT LANE CLOSED",
        lat: 39.4143,
        lng: -77.4105,
        observedAt: NOW,
        beaconsEnabled: true,
        evidence: "device-observation",
        sourceUrl: CHART_ROAD_SOURCES.messages,
      },
    ];
    const status = selectCountyStatus({
      situation: situation(),
      road: buildRoadIntelligenceSnapshot({ sources, now: new Date(NOW) }),
      civic: quietCivic,
    });
    expect(status.count).toBe(1);
    expect(status.items[0].point).toBeUndefined();
    expect(status.items[0].towns).toBeUndefined();
    expect(status.items[0].detail).toBe(
      "This message is on an official highway sign at I-70 East prior to exit 52 US 15.",
    );
  });

  it("leaves weather, schools and civic notices unlocated, with their publishers", () => {
    const status = selectCountyStatus({
      situation: situation({ weather: envelope("nws", [nws()]) }),
      road: quietRoad(),
      civic: { alerts: [civic()], available: true, degraded: false },
    });
    for (const item of status.items) expect(item.point).toBeUndefined();
    expect(status.items.find((item) => item.family === "weather")).toMatchObject({
      source: "National Weather Service",
      seen: { verb: "Issued" },
      detail: "Heat Advisory in effect",
    });
    expect(status.items.find((item) => item.family === "civic")).toMatchObject({
      source: "City of Frederick",
      seen: { at: NOW, verb: "Published" },
    });
  });
});

describe("countyStatusSentence", () => {
  const item = (title: string): CountyStatusItem => ({
    id: "x",
    family: "roads",
    severity: "advisory",
    title,
    href: "/pulse?open=traffic",
  });

  it("names the worst item after the word", () => {
    expect(
      countyStatusSentence({ word: "Advisory", items: [item("MD 75 work-zone closure"), item("Crash")] }),
    ).toBe("Advisory: MD 75 work-zone closure.");
  });

  it("does not double the closing punctuation", () => {
    expect(countyStatusSentence({ word: "Urgent", items: [item("Shelter in place now.")] })).toBe(
      "Urgent: Shelter in place now.",
    );
  });

  it("has nothing to say when nothing is graded", () => {
    expect(countyStatusSentence({ word: "All quiet", items: [] })).toBeNull();
    expect(countyStatusSentence({ word: "Unknown", items: [] })).toBeNull();
  });

  it("reads the detail key from the item's /pulse link", () => {
    expect(countyStatusDetailKey(item("Crash"))).toBe("traffic");
    expect(countyStatusDetailKey({ href: "/pulse" })).toBeNull();
  });
});

describe("townsAt", () => {
  it("names the town whose area holds the point and no other", () => {
    expect(townsAt([[-77.4105, 39.4143]])).toEqual(["frederick"]);
    expect(townsAt([[-77.4108, 39.6231]])).toEqual(["thurmont"]);
    // Open country between towns belongs to none.
    expect(townsAt([[-77.25, 39.6]])).toEqual([]);
  });
});
