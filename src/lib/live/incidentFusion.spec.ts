import { describe, expect, it } from "vitest";
import type { ChartIncident } from "@/lib/integrations/mdot-chart";
import type { GeocodedIncident } from "@/lib/integrations/scannerIncidents";
import {
  fuseScannerWithChartIncidents,
  type IncidentFusionOptions,
} from "./incidentFusion";

const NOW = "2026-07-27T18:00:00.000Z";
const OPTIONS: IncidentFusionOptions = {
  now: NOW,
  maxDistanceMeters: 500,
  maxTimeDeltaMs: 30 * 60_000,
  scannerFreshForMs: 60 * 60_000,
  chartFreshForMs: 2 * 60 * 60_000,
};

function scanner(
  overrides: Partial<GeocodedIncident> = {},
): GeocodedIncident {
  return {
    kind: "Crash",
    location: "100 block N Market St",
    time: "1:35 pm",
    roadImpact: true,
    firstAt: "2026-07-27T17:35:00.000Z",
    at: "2026-07-27T17:40:00.000Z",
    updates: 2,
    lat: 39.41635,
    lng: -77.41065,
    ...overrides,
  };
}

function chart(overrides: Partial<ChartIncident> = {}): ChartIncident {
  return {
    id: "chart-crash",
    type: "Incident",
    description: "Crash on N Market Street",
    county: "Frederick",
    road: "N Market St",
    direction: "NB",
    location: "123 N Market St",
    lat: 39.4165,
    lng: -77.4106,
    started_at: "2026-07-27T17:37:00.000Z",
    severity: "High",
    lanes_affected: "Right lane closed",
    ...overrides,
  };
}

describe("fuseScannerWithChartIncidents", () => {
  it("corroborates a compatible road incident within the time and distance windows", () => {
    const result = fuseScannerWithChartIncidents(
      [scanner()],
      [chart()],
      OPTIONS,
    );

    expect(result.matchedChartIncidentIds).toEqual(["chart-crash"]);
    expect(result.unmatchedChartIncidentIds).toEqual([]);
    expect(result.incidents).toHaveLength(1);
    expect(result.incidents[0]).toMatchObject({
      kind: "Crash",
      status: "corroborated",
      location: "100 block N Market St",
      coordinate: {
        lat: 39.41635,
        lng: -77.41065,
        precision: "block",
        source: "frederick-scanner",
      },
      officialRoadImpact: {
        chartId: "chart-crash",
        road: "N Market St",
        severity: "High",
        lanesAffected: "Right lane closed",
      },
      match: {
        chartId: "chart-crash",
        compatibility: "specific",
        timeDeltaMs: 2 * 60_000,
      },
    });
    expect(result.incidents[0].sources).toEqual([
      expect.objectContaining({
        source: "frederick-scanner",
        confidence: "preliminary",
        firstReportedAt: "2026-07-27T17:35:00.000Z",
        lastReportedAt: "2026-07-27T17:40:00.000Z",
        freshness: {
          state: "fresh",
          ageMs: 20 * 60_000,
          freshForMs: 60 * 60_000,
        },
      }),
      expect.objectContaining({
        source: "mdot-chart",
        confidence: "official",
        firstReportedAt: "2026-07-27T17:37:00.000Z",
        lastReportedAt: "2026-07-27T17:37:00.000Z",
        freshness: {
          state: "fresh",
          ageMs: 23 * 60_000,
          freshForMs: 2 * 60 * 60_000,
        },
      }),
    ]);
    expect(result.incidents[0].reasons).toEqual([
      {
        code: "initial-report",
        label: "Initial report",
        value: "Frederick Scanner",
      },
      {
        code: "mdot-road-report",
        label: "MDOT road report",
        value: "MDOT CHART",
      },
      {
        code: "lane-impact",
        label: "Lane impact",
        value: "Right lane closed",
      },
    ]);
  });

  it("keeps a report preliminary when type, distance, or time is incompatible", () => {
    const result = fuseScannerWithChartIncidents(
      [
        scanner({ location: "Gas House Pike", kind: "Gas leak" }),
        scanner({
          location: "US 15",
          firstAt: "2026-07-27T16:00:00.000Z",
          at: "2026-07-27T16:05:00.000Z",
        }),
        scanner({
          location: "MD 85",
          lat: 39.30,
          lng: -77.42,
          firstAt: "2026-07-27T17:35:00.000Z",
        }),
      ],
      [chart()],
      OPTIONS,
    );

    expect(result.incidents).toHaveLength(3);
    expect(result.incidents.every((incident) => incident.status === "preliminary")).toBe(true);
    expect(result.incidents.every((incident) => incident.sources.length === 1)).toBe(true);
    expect(result.matchedChartIncidentIds).toEqual([]);
    expect(result.unmatchedChartIncidentIds).toEqual(["chart-crash"]);
  });

  it("never replaces block-level Scanner geography with sharper CHART geography", () => {
    const exactAddress = "127 N Market St, Apartment 4B";
    const result = fuseScannerWithChartIncidents(
      [
        scanner({
          location: "127 N Market St, Apt: 4B",
          lat: 39.41635,
          lng: -77.41065,
        }),
      ],
      [
        chart({
          description: `Crash outside ${exactAddress}`,
          location: exactAddress,
          lat: 39.41699,
          lng: -77.41001,
        }),
      ],
      OPTIONS,
    );

    const fused = result.incidents[0];
    expect(fused.status).toBe("corroborated");
    expect(fused.location).toBe("100 BLOCK N Market St");
    expect(fused.coordinate).toEqual({
      lat: 39.41635,
      lng: -77.41065,
      precision: "block",
      source: "frederick-scanner",
    });
    expect(JSON.stringify(fused)).not.toContain(exactAddress);
    expect(JSON.stringify(fused)).not.toContain("39.41699");
    expect(JSON.stringify(fused)).not.toContain("-77.41001");
  });

  it("selects one candidate deterministically regardless of input order", () => {
    const lessUseful = chart({
      id: "z-generic",
      description: "Active incident",
      location: "N Market St",
      lat: 39.41636,
      lng: -77.41065,
      started_at: "2026-07-27T17:36:00.000Z",
      severity: "High",
    });
    const specific = chart({
      id: "a-specific",
      description: "Vehicle collision on N Market St",
      lat: 39.417,
      lng: -77.41065,
      started_at: "2026-07-27T17:38:00.000Z",
      severity: "Medium",
    });

    const forward = fuseScannerWithChartIncidents(
      [scanner()],
      [lessUseful, specific],
      OPTIONS,
    );
    const reversed = fuseScannerWithChartIncidents(
      [scanner()],
      [specific, lessUseful],
      OPTIONS,
    );

    expect(forward).toEqual(reversed);
    expect(forward.incidents[0].match?.chartId).toBe("a-specific");
    expect(forward.unmatchedChartIncidentIds).toEqual(["z-generic"]);
  });

  it("allows one CHART record to corroborate only the best matching Scanner report", () => {
    const closer = scanner({
      location: "100 block N Market St",
      lat: 39.41635,
      lng: -77.41065,
    });
    const farther = scanner({
      location: "200 block N Market St",
      lat: 39.418,
      lng: -77.41065,
    });

    const result = fuseScannerWithChartIncidents(
      [farther, closer],
      [chart()],
      OPTIONS,
    );

    expect(result.incidents.filter((incident) => incident.status === "corroborated")).toHaveLength(1);
    expect(
      result.incidents.find((incident) => incident.status === "corroborated")?.location,
    ).toBe("100 block N Market St");
    expect(result.matchedChartIncidentIds).toEqual(["chart-crash"]);
  });

  it("preserves stale freshness and ignores a CHART row with an unknown timestamp", () => {
    const result = fuseScannerWithChartIncidents(
      [
        scanner({
          firstAt: "2026-07-27T15:00:00.000Z",
          at: "2026-07-27T15:05:00.000Z",
        }),
      ],
      [
        chart({
          started_at: "not-a-time",
        }),
      ],
      {
        ...OPTIONS,
        maxTimeDeltaMs: 4 * 60 * 60_000,
      },
    );

    expect(result.incidents[0].status).toBe("preliminary");
    expect(result.incidents[0].sources[0].freshness).toEqual({
      state: "stale",
      ageMs: 2 * 60 * 60_000 + 55 * 60_000,
      freshForMs: 60 * 60_000,
    });
    expect(result.unmatchedChartIncidentIds).toEqual(["chart-crash"]);
  });

  it("does not corroborate source rows after either source freshness window", () => {
    const result = fuseScannerWithChartIncidents(
      [
        scanner({
          firstAt: "2026-07-27T15:00:00.000Z",
          at: "2026-07-27T15:05:00.000Z",
        }),
      ],
      [
        chart({
          started_at: "2026-07-27T15:02:00.000Z",
        }),
      ],
      {
        ...OPTIONS,
        maxTimeDeltaMs: 4 * 60 * 60_000,
        chartFreshForMs: 4 * 60 * 60_000,
      },
    );

    expect(result.incidents[0].status).toBe("preliminary");
    expect(result.matchedChartIncidentIds).toEqual([]);
  });

  it("requires a shared road token for a generic nearby CHART incident", () => {
    const result = fuseScannerWithChartIncidents(
      [scanner({ location: "100 block N Market St" })],
      [
        chart({
          description: "Active incident",
          road: "Bentz St",
          location: "Bentz St",
        }),
      ],
      OPTIONS,
    );

    expect(result.incidents[0].status).toBe("preliminary");
    expect(result.matchedChartIncidentIds).toEqual([]);
  });

  it("removes a repeated dispatch intersection without changing its safe location", () => {
    const result = fuseScannerWithChartIncidents(
      [
        scanner({
          location: "Rt194 / Detour Rd, Rt194 / Detour Rd",
        }),
      ],
      [],
      OPTIONS,
    );

    expect(result.incidents[0].location).toBe("Rt194 / Detour Rd");
  });

  it("drops private or non-road scanner kinds from the fusion surface", () => {
    const result = fuseScannerWithChartIncidents(
      [
        scanner({
          kind: "Structure fire",
          roadImpact: false,
        }),
      ],
      [chart()],
      OPTIONS,
    );

    expect(result.incidents).toEqual([]);
    expect(result.matchedChartIncidentIds).toEqual([]);
    expect(result.unmatchedChartIncidentIds).toEqual(["chart-crash"]);
  });
});
