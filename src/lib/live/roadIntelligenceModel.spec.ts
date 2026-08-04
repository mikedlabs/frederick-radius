import { describe, expect, it } from "vitest";
import {
  buildRoadIntelligenceSnapshot,
  roadAttentionScopeLabel,
  selectRoadWorkZoneFeatureCollection,
  selectTodayRoadSignal,
  leadTravelTime,
  travelMinutes,
  type RoadIntelligenceSources,
} from "./roadIntelligenceModel";
import { MDOT_WZDX_SOURCE_URL } from "@/lib/integrations/mdot-wzdx";
import {
  CHART_ROAD_SOURCES,
  type ChartTravelTime,
} from "@/lib/integrations/mdot-road-feeds";

const NOW = new Date("2026-07-28T16:00:00.000Z");

function quietSources(): RoadIntelligenceSources {
  return {
    workZones: {
      data: [],
      available: true,
      asOf: NOW.toISOString(),
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    },
    speeds: { data: [], available: true, asOf: NOW.toISOString() },
    travelTimes: { data: [], available: true, asOf: NOW.toISOString() },
    messages: { data: [], available: true, asOf: NOW.toISOString() },
    weatherStations: { data: [], available: true, asOf: NOW.toISOString() },
    roadConditions: { data: [], available: true, asOf: NOW.toISOString() },
    snowEmergency: { data: [], available: true, asOf: NOW.toISOString() },
  };
}

describe("road intelligence model", () => {
  it("keeps a complete quiet check distinct from an unavailable check", () => {
    const quiet = buildRoadIntelligenceSnapshot({
      sources: quietSources(),
      now: NOW,
    });
    expect(quiet.summary).toMatchObject({
      status: "quiet",
      coverage: "complete",
      activeCount: 0,
    });

    const partial = quietSources();
    partial.workZones = {
      data: [],
      available: false,
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    };
    expect(
      buildRoadIntelligenceSnapshot({ sources: partial, now: NOW }).summary,
    ).toMatchObject({ status: "unknown", coverage: "partial" });
  });

  it("lets an active snow emergency outrank a work-zone closure", () => {
    const sources = quietSources();
    sources.workZones.data = [{
      id: "wz-1",
      road: "US 15",
      roadNames: ["US 15"],
      description: "Northbound maintenance",
      status: "active",
      startAt: NOW.toISOString(),
      endAt: "2026-07-28T18:00:00.000Z",
      updatedAt: NOW.toISOString(),
      geometry: {
        type: "LineString",
        coordinates: [[-77.42, 39.41], [-77.41, 39.42]],
      },
      lanes: { total: 2, closed: 2, summary: "all-lanes-closed" },
      positionConfidence: "verified",
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    }];
    sources.snowEmergency.data = [{
      id: "sep-1",
      county: "Frederick County",
      status: "active",
      declaredAt: NOW.toISOString(),
      liftedAt: null,
      exception: null,
      evidence: "official-declaration",
      sourceUrl: CHART_ROAD_SOURCES.snowEmergency,
    }];

    const snapshot = buildRoadIntelligenceSnapshot({ sources, now: NOW });
    expect(selectTodayRoadSignal(snapshot)).toMatchObject({
      kind: "snow-emergency",
      severity: "emergency",
    });
    expect(snapshot.attention[1]?.kind).toBe("work-zone-closure");
  });

  it("ships only the map-safe WZDx projection to the browser", () => {
    const sources = quietSources();
    sources.workZones.data = [{
      id: "wz-1",
      road: "MD 180",
      roadNames: ["MD 180"],
      description: "Bridge repair",
      direction: "westbound",
      status: "active",
      startAt: NOW.toISOString(),
      endAt: null,
      updatedAt: NOW.toISOString(),
      geometry: {
        type: "LineString",
        coordinates: [[-77.49, 39.39], [-77.48, 39.4]],
      },
      lanes: { total: 2, closed: 1, summary: "some-lanes-closed" },
      positionConfidence: "approximate",
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    }];
    const snapshot = buildRoadIntelligenceSnapshot({ sources, now: NOW });
    const feature = selectRoadWorkZoneFeatureCollection(snapshot).features[0];

    expect(feature.properties).toEqual({
      id: "wz-1",
      road: "MD 180",
      title: "Bridge repair",
      laneImpact: "1 lane closed",
      status: "Active",
      startAt: NOW.toISOString(),
      endAt: undefined,
      updatedAt: NOW.toISOString(),
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    });
    expect(feature.properties).not.toHaveProperty("positionConfidence");
  });

  it("labels a highway-message scope as the sign location, not the incident area", () => {
    const sources = quietSources();
    sources.messages.data = [{
      id: "dms-70-52",
      location: "I-70 East prior to exit 52 US 15",
      message: "CRASH PAST EXIT 82 US 40 ALL LANES CLOSED",
      lng: -77.46,
      lat: 39.39,
      observedAt: NOW.toISOString(),
      beaconsEnabled: true,
      evidence: "device-observation",
      sourceUrl: CHART_ROAD_SOURCES.messages,
    }];

    const signal = buildRoadIntelligenceSnapshot({ sources, now: NOW }).attention[0];

    expect(signal).toMatchObject({
      kind: "highway-message",
      scope: "I-70 East prior to exit 52 US 15",
    });
    expect(roadAttentionScopeLabel(signal!)).toBe("Sign location");
  });
});

describe("leadTravelTime", () => {
  function segment(
    name: string,
    seconds: number,
    trend: ChartTravelTime["trend"],
  ): ChartTravelTime {
    return {
      id: name,
      name,
      distanceMiles: 10,
      travelTimeSeconds: seconds,
      averageSpeedMph: Math.round((10 / (seconds / 3600)) * 10) / 10,
      trend,
      observedAt: NOW.toISOString(),
      roads: [name],
      evidence: "computed-from-road-sensors",
      sourceUrl: CHART_ROAD_SOURCES.travelTimes,
    };
  }

  it("leads with a corridor that is getting worse, not merely the longest", () => {
    // A rising number is the one a person needs first. The longest drive of the
    // day is normal; a drive that just grew is news.
    const lead = leadTravelTime([
      segment("I-70 east", 900, "steady"),
      segment("I-270 south", 600, "longer"),
    ]);
    expect(lead?.name).toBe("I-270 south");
  });

  it("falls back to the longest drive when nothing is trending longer", () => {
    const lead = leadTravelTime([
      segment("I-270 south", 600, "shorter"),
      segment("I-70 east", 900, "steady"),
    ]);
    expect(lead?.name).toBe("I-70 east");
  });

  it("has nothing to say when the feed carried no segments", () => {
    // The tile falls back to its all-clear wording; it must never invent one.
    expect(leadTravelTime([])).toBeNull();
  });

  it("never rounds a real drive down to zero minutes", () => {
    expect(travelMinutes(20)).toBe(1);
    expect(travelMinutes(89)).toBe(1);
    expect(travelMinutes(90)).toBe(2);
    expect(travelMinutes(1_020)).toBe(17);
  });

  it("is a pure read, leaving the caller's array order alone", () => {
    const input = [
      segment("I-270 south", 600, "steady"),
      segment("I-70 east", 900, "steady"),
    ];
    leadTravelTime(input);
    expect(input.map((s) => s.name)).toEqual(["I-270 south", "I-70 east"]);
  });
});
