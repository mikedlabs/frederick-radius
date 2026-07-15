import { describe, expect, it } from "vitest";
import {
  cleanChartDescription,
  cleanChartLaneStatus,
  dedupeChartIncidents,
  type ChartIncident,
} from "./mdot-chart";

describe("MDOT CHART normalization", () => {
  it("turns internal enum labels into plain language", () => {
    expect(cleanChartDescription("Action Event @ VOL:Compacted Demand")).toBe("Heavy traffic");
    expect(cleanChartLaneStatus("VOL:Compacted Demand")).toBe("Heavy traffic");
    expect(cleanChartLaneStatus("None")).toBeUndefined();
  });

  it("deduplicates republished copies while keeping the stronger record", () => {
    const base: ChartIncident = {
      id: "old",
      type: "Incident",
      description: "Crash near Exit 48",
      county: "Frederick",
      road: "I-70",
      direction: "Westbound",
      location: "I-70 near Exit 48",
      lng: -77.4,
      lat: 39.4,
      started_at: "2026-07-15T12:00:00Z",
      severity: "Medium",
    };
    const result = dedupeChartIncidents([
      base,
      { ...base, id: "new", severity: "High", started_at: "2026-07-15T12:03:00Z" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("new");
  });
});
