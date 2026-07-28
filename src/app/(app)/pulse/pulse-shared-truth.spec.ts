import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pulsePage = readFileSync("src/app/(app)/pulse/page.tsx", "utf8");

describe("Pulse shared current-situation contract", () => {
  it("loads the county condition feeds through one shared snapshot", () => {
    expect(pulsePage.match(/getCurrentSituationSnapshot\(\)/g)).toHaveLength(1);

    for (const directGetter of [
      "getChartIncidentsFrederickResult",
      "getFrederickOutagesResult",
      "getFcpsAlertsResult",
      "getPulsePointIncidentsResult",
      "getNwsAlertsResult",
      "getAirQuality",
      "getGeocodedScannerIncidents",
    ]) {
      expect(pulsePage).not.toContain(directGetter);
    }
  });

  it("uses the snapshot freshness, coverage, and fused-road decisions", () => {
    expect(pulsePage).toContain('source.availability === "available"');
    expect(pulsePage).toContain('source.freshness === "fresh"');
    expect(pulsePage).toContain('situation.summary.coverage === "partial"');
    expect(pulsePage).toContain("situation.roads.live");

    for (const source of [
      "traffic",
      "power",
      "schools",
      "fireRescue",
      "weather",
      "air",
    ]) {
      expect(pulsePage).toContain(`situation.sources.${source}`);
    }
  });

  it("does not turn a disabled PulsePoint source into an all-clear", () => {
    expect(pulsePage).toContain("sourceDisplayState(safetySource)");
    expect(pulsePage).toContain('safetyState === "disabled"');
    expect(pulsePage).toContain("PulsePoint is not connected to Radius right now.");
    expect(pulsePage).not.toContain(
      "!safetyConfigured || sourceIsCurrent(safetySource)",
    );
  });
});
