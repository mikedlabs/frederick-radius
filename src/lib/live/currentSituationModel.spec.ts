import { describe, expect, it } from "vitest";
import type { AqiObservation } from "@/lib/integrations/airnow";
import type { FcpsAlert } from "@/lib/integrations/fcps";
import type { FrederickOutages } from "@/lib/integrations/firstenergy";
import type { ChartIncident } from "@/lib/integrations/mdot-chart";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { PulsePointIncident } from "@/lib/integrations/pulsepoint";
import type { GeocodedIncident } from "@/lib/integrations/scannerIncidents";
import type { IncidentFusionResult } from "@/lib/live/incidentFusion";
import { fuseScannerWithChartIncidents } from "@/lib/live/incidentFusion";
import {
  buildCurrentSituationSnapshot,
  selectChartIncidentsResult,
  selectMapRoadPins,
  selectPulseStatus,
  sourceDisplayState,
  sourceEnvelope,
  type CurrentSituationSources,
} from "./currentSituationModel";

const NOW = "2026-07-28T16:00:00.000Z";
const EMPTY_FUSION: IncidentFusionResult = {
  incidents: [],
  matchedChartIncidentIds: [],
  unmatchedChartIncidentIds: [],
};
const EMPTY_OUTAGES: FrederickOutages = {
  total_out: 0,
  total_served: 0,
  munis: [],
};

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

function sources(
  overrides: Partial<CurrentSituationSources> = {},
): CurrentSituationSources {
  return {
    weather: envelope<NwsAlert[]>("nws", []),
    schools: envelope<FcpsAlert[]>("fcps", []),
    traffic: envelope<ChartIncident[]>("mdot-chart", []),
    scanner: envelope<GeocodedIncident[]>("frederick-scanner", [], {
      requiredForQuiet: false,
    }),
    power: envelope<FrederickOutages>("firstenergy", EMPTY_OUTAGES, {
      itemCount: 0,
    }),
    fireRescue: envelope<PulsePointIncident[]>("pulsepoint", [], {
      availability: "disabled",
      requiredForQuiet: false,
      asOf: null,
      asOfBasis: null,
    }),
    air: envelope<AqiObservation[]>("airnow", []),
    ...overrides,
  };
}

function chart(overrides: Partial<ChartIncident> = {}): ChartIncident {
  return {
    id: "chart-1",
    type: "Incident",
    description: "Crash",
    county: "Frederick",
    road: "US 15",
    location: "US 15",
    lng: -77.4,
    lat: 39.4,
    started_at: "2026-07-28T15:45:00.000Z",
    severity: "High",
    ...overrides,
  };
}

function scanner(
  overrides: Partial<GeocodedIncident> = {},
): GeocodedIncident {
  return {
    kind: "Crash",
    location: "100 block N Market St",
    time: "11:40 am",
    roadImpact: true,
    firstAt: "2026-07-28T15:35:00.000Z",
    at: "2026-07-28T15:40:00.000Z",
    updates: 2,
    lat: 39.41635,
    lng: -77.41065,
    ...overrides,
  };
}

describe("sourceEnvelope", () => {
  it("keeps availability and freshness separate", () => {
    expect(
      envelope("nws", [], {
        availability: "unavailable",
        asOf: null,
      }),
    ).toMatchObject({
      availability: "unavailable",
      freshness: "unknown",
      itemCount: 0,
    });
    expect(
      envelope("nws", [], {
        asOf: "2026-07-28T15:50:00.000Z",
        staleAfterSeconds: 60,
      }),
    ).toMatchObject({
      availability: "available",
      freshness: "stale",
    });
  });

  it("does not infer freshness without an explicit as-of timestamp", () => {
    expect(
      envelope("nws", [], {
        asOf: null,
        asOfBasis: null,
      }).freshness,
    ).toBe("unknown");
  });
});

describe("sourceDisplayState", () => {
  it("never presents a disabled source as a current empty result", () => {
    expect(
      sourceDisplayState({
        availability: "disabled",
        freshness: "unknown",
      }),
    ).toBe("disabled");
    expect(
      sourceDisplayState({
        availability: "available",
        freshness: "fresh",
      }),
    ).toBe("current");
    expect(
      sourceDisplayState({
        availability: "available",
        freshness: "stale",
      }),
    ).toBe("unavailable");
  });
});

describe("buildCurrentSituationSnapshot", () => {
  it("reports quiet only when every required source is fresh", () => {
    const snapshot = buildCurrentSituationSnapshot({
      sources: sources(),
      roadFusion: EMPTY_FUSION,
      now: NOW,
    });

    expect(snapshot.summary).toMatchObject({
      status: "quiet",
      coverage: "complete",
      tone: "quiet",
      activeCount: 0,
      degradedSources: [],
    });
    expect(selectPulseStatus(snapshot)).toEqual({
      active: false,
      count: 0,
      tone: "quiet",
      ok: true,
      lastUpdated: NOW,
    });
  });

  it("reports unknown instead of quiet when a required source is unavailable", () => {
    const snapshot = buildCurrentSituationSnapshot({
      sources: sources({
        traffic: envelope<ChartIncident[]>("mdot-chart", [], {
          availability: "unavailable",
          asOf: null,
        }),
      }),
      roadFusion: EMPTY_FUSION,
      now: NOW,
    });

    expect(snapshot.summary).toMatchObject({
      status: "unknown",
      coverage: "partial",
      activeCount: 0,
      degradedSources: ["mdot-chart"],
    });
    expect(selectPulseStatus(snapshot).ok).toBe(false);
  });

  it("keeps a verified active signal active when another source is degraded", () => {
    const snapshot = buildCurrentSituationSnapshot({
      sources: sources({
        traffic: envelope("mdot-chart", [chart()]),
        weather: envelope<NwsAlert[]>("nws", [], {
          availability: "unavailable",
          asOf: null,
        }),
      }),
      roadFusion: EMPTY_FUSION,
      now: NOW,
    });

    expect(snapshot.summary).toMatchObject({
      status: "active",
      coverage: "partial",
      tone: "alert",
      activeCount: 1,
    });
  });

  it("does not treat a deliberately disabled optional source as degraded", () => {
    const snapshot = buildCurrentSituationSnapshot({
      sources: sources(),
      roadFusion: EMPTY_FUSION,
      now: NOW,
    });

    expect(snapshot.sources.fireRescue.availability).toBe("disabled");
    expect(snapshot.summary.coverage).toBe("complete");
    expect(snapshot.summary.degradedSources).not.toContain("pulsepoint");
  });

  it("does not activate stale source rows", () => {
    const staleTraffic = envelope("mdot-chart", [chart()], {
      asOf: "2026-07-28T15:00:00.000Z",
      staleAfterSeconds: 300,
    });
    const snapshot = buildCurrentSituationSnapshot({
      sources: sources({ traffic: staleTraffic }),
      roadFusion: EMPTY_FUSION,
      now: NOW,
    });

    expect(snapshot.summary.status).toBe("unknown");
    expect(snapshot.summary.activeCount).toBe(0);
    expect(selectChartIncidentsResult(snapshot)).toEqual({
      data: [],
      available: false,
      asOf: "2026-07-28T15:00:00.000Z",
    });
  });

  it("does not preserve stale CHART corroboration on a fresh Scanner item", () => {
    const scannerIncident = scanner();
    const officialIncident = chart({
      id: "matched",
      road: "N Market St",
      location: "123 N Market St",
      lat: 39.4165,
      lng: -77.4106,
    });
    const suppliedFusion = fuseScannerWithChartIncidents(
      [scannerIncident],
      [officialIncident],
      { now: NOW },
    );
    expect(suppliedFusion.incidents[0]?.status).toBe("corroborated");

    const snapshot = buildCurrentSituationSnapshot({
      sources: sources({
        scanner: envelope("frederick-scanner", [scannerIncident], {
          requiredForQuiet: false,
        }),
        traffic: envelope("mdot-chart", [officialIncident], {
          asOf: "2026-07-28T15:00:00.000Z",
          staleAfterSeconds: 300,
        }),
      }),
      roadFusion: suppliedFusion,
      now: NOW,
    });

    expect(snapshot.roads.live.items[0]).toMatchObject({
      status: "preliminary",
      sources: [
        expect.objectContaining({ source: "frederick-scanner" }),
      ],
    });
    expect(snapshot.roads.live.items[0]?.officialRoadImpact).toBeUndefined();
    expect(snapshot.roads.live.corroboratedCount).toBe(0);
    expect(snapshot.roads.matchedOfficialIds).toEqual([]);
  });

  it("keeps corroborated official road pins visible when Scanner is off", () => {
    const matched = chart({ id: "matched" });
    const unmatched = chart({ id: "unmatched", road: "I-70" });
    const snapshot = buildCurrentSituationSnapshot({
      sources: sources({
        traffic: envelope("mdot-chart", [matched, unmatched]),
      }),
      roadFusion: {
        incidents: [],
        matchedChartIncidentIds: ["matched"],
        unmatchedChartIncidentIds: ["unmatched"],
      },
      now: NOW,
    });

    expect(selectMapRoadPins(snapshot).official.map((incident) => incident.id))
      .toEqual(["matched", "unmatched"]);
    expect(snapshot.roads.live.scannerAvailable).toBe(true);
  });

  it("keeps public Scanner board activity visible without inventing road pins", () => {
    const snapshot = buildCurrentSituationSnapshot({
      sources: sources({
        scanner: envelope<GeocodedIncident[]>("frederick-scanner", [], {
          requiredForQuiet: false,
          itemCount: 2,
        }),
      }),
      roadFusion: EMPTY_FUSION,
      now: NOW,
    });

    expect(snapshot.roads.live).toMatchObject({
      items: [],
      totalCount: 0,
      reportedCount: 2,
      notShownCount: 2,
      scannerAvailable: true,
    });
    expect(snapshot.roads.live).not.toHaveProperty("allClear");
  });
});
