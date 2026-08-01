import { describe, expect, it } from "vitest";
import type { ChartIncident } from "@/lib/integrations/mdot-chart";
import type { GeocodedIncident } from "@/lib/integrations/scannerIncidents";
import {
  buildLiveIncidentSnapshot,
  DEFAULT_LIVE_INCIDENT_LIMIT,
} from "./incidentSnapshot";

const NOW = "2026-07-27T18:00:00.000Z";

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
    description: "Crash outside 127 N Market St",
    county: "Frederick",
    road: "N Market St",
    direction: "NB",
    location: "127 N Market St",
    lat: 39.4165,
    lng: -77.4106,
    started_at: "2026-07-27T17:37:00.000Z",
    severity: "High",
    lanes_affected: "Right lane closed",
    ...overrides,
  };
}

describe("buildLiveIncidentSnapshot", () => {
  it("returns a corroborated public signal without raw CHART geography or match diagnostics", () => {
    const snapshot = buildLiveIncidentSnapshot(
      [scanner()],
      {
        data: [chart()],
        available: true,
      },
      NOW,
    );

    expect(snapshot).toMatchObject({
      chartAvailable: true,
      reportedCount: 1,
      notShownCount: 0,
      totalCount: 1,
      corroboratedCount: 1,
      updatedAt: NOW,
      items: [
        {
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
        },
      ],
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("127 N Market St");
    expect(serialized).not.toContain("39.4165");
    expect(serialized).not.toContain("distanceMeters");
    expect(serialized).not.toContain("timeDeltaMs");
  });

  it("keeps an empty source response neutral instead of creating an all-clear claim", () => {
    const snapshot = buildLiveIncidentSnapshot(
      [],
      {
        data: [],
        available: false,
      },
      NOW,
    );

    expect(snapshot).toEqual({
      items: [],
      reportedCount: 0,
      notShownCount: 0,
      totalCount: 0,
      corroboratedCount: 0,
      chartAvailable: false,
      updatedAt: NOW,
    });
    expect(snapshot).not.toHaveProperty("allClear");
    expect(snapshot).not.toHaveProperty("status");
  });

  it("caps the public payload even when a caller requests an excessive limit", () => {
    const scanners = Array.from(
      { length: DEFAULT_LIVE_INCIDENT_LIMIT + 8 },
      (_, index) =>
        scanner({
          location: `${100 + index} block N Market St`,
          firstAt: new Date(Date.parse(NOW) - index * 60_000).toISOString(),
          at: new Date(Date.parse(NOW) - index * 60_000).toISOString(),
          lat: 39.4 + index * 0.001,
        }),
    );

    const snapshot = buildLiveIncidentSnapshot(
      scanners,
      {
        data: [],
        available: true,
      },
      NOW,
    );

    expect(snapshot.items).toHaveLength(DEFAULT_LIVE_INCIDENT_LIMIT);
    expect(snapshot.totalCount).toBe(DEFAULT_LIVE_INCIDENT_LIMIT + 8);
    expect(snapshot.reportedCount).toBe(DEFAULT_LIVE_INCIDENT_LIMIT + 8);
    expect(snapshot.notShownCount).toBe(0);
    expect(snapshot.corroboratedCount).toBe(0);
  });
});
