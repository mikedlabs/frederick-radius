import { describe, expect, it } from "vitest";
import {
  buildRoadIntelligenceSnapshot,
  roadAttentionStatusLabel,
  selectRoadWorkZoneFeatureCollection,
  selectTodayRoadSignal,
  type RoadIntelligenceSources,
} from "./roadIntelligenceModel";
import { MDOT_WZDX_SOURCE_URL } from "@/lib/integrations/mdot-wzdx";
import { CHART_ROAD_SOURCES } from "@/lib/integrations/mdot-road-feeds";

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

  it("uses closed and avoid language for an all-lanes work-zone closure", () => {
    const sources = quietSources();
    sources.workZones.data = [{
      id: "wz-closure",
      road: "US 15BU",
      roadNames: ["US 15BU"],
      description: "US 15 NORTH/SOUTH AT MM 1.0",
      direction: "northbound",
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

    const snapshot = buildRoadIntelligenceSnapshot({ sources, now: NOW });
    const signal = snapshot.attention[0];

    expect(signal).toMatchObject({
      kind: "work-zone-closure",
      severity: "warning",
      detail:
        "All lanes are closed. Avoid this route. US 15 NORTH/SOUTH AT MM 1.0",
    });
    expect(roadAttentionStatusLabel(signal!)).toBe(
      "Closed · avoid this route",
    );
  });

  it("keeps generic warning signals at use-caution language", () => {
    expect(
      roadAttentionStatusLabel({
        id: "condition-1",
        kind: "road-condition",
        priority: 55,
        severity: "warning",
        title: "Travel may be restricted",
        detail: "Snow-covered primary roads",
        scope: "Primary roads",
        sourceLabel: "MDOT CHART road conditions",
        sourceUrl: CHART_ROAD_SOURCES.roadConditions,
        observedAt: NOW.toISOString(),
      }),
    ).toBe("Use caution");
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
});
