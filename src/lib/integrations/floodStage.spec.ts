import { describe, it, expect } from "vitest";
import {
  classifyFlood,
  currentFloodCoverage,
  FLOOD_STAGES,
  nwsGaugeUrl,
  worstCurrentFloodReading,
} from "@/lib/integrations/floodStage";

const monocacyFrederick = FLOOD_STAGES["01643000"]; // action 13 / minor 15 / mod 17 / major 20

describe("classifyFlood", () => {
  it("returns null without a reading or without thresholds", () => {
    expect(classifyFlood(undefined, monocacyFrederick)).toBeNull();
    expect(classifyFlood(null, monocacyFrederick)).toBeNull();
    expect(classifyFlood(4, undefined)).toBeNull();
    expect(classifyFlood(NaN, monocacyFrederick)).toBeNull();
  });

  it("labels a calm reading Normal and reports feet to flood stage", () => {
    const c = classifyFlood(4, monocacyFrederick)!;
    expect(c.key).toBe("normal");
    expect(c.tone).toBe("neutral");
    expect(c.floodStageFt).toBe(15);
    expect(c.toFloodFt).toBe(11); // 15 - 4
  });

  it("crosses into action at the action stage (warning tone)", () => {
    expect(classifyFlood(12.9, monocacyFrederick)!.key).toBe("normal");
    const c = classifyFlood(13, monocacyFrederick)!;
    expect(c.key).toBe("action");
    expect(c.tone).toBe("warning");
  });

  it("escalates minor → moderate → major at each threshold (all danger)", () => {
    expect(classifyFlood(15, monocacyFrederick)!.key).toBe("minor");
    expect(classifyFlood(16.9, monocacyFrederick)!.key).toBe("minor");
    expect(classifyFlood(17, monocacyFrederick)!.key).toBe("moderate");
    expect(classifyFlood(20, monocacyFrederick)!.key).toBe("major");
    expect(classifyFlood(99, monocacyFrederick)!.key).toBe("major");
    for (const ft of [15, 17, 20]) {
      expect(classifyFlood(ft, monocacyFrederick)!.tone).toBe("danger");
    }
  });

  it("reports negative feet-to-flood once flooding", () => {
    expect(classifyFlood(18, monocacyFrederick)!.toFloodFt).toBe(-3); // 15 - 18
  });
});

describe("FLOOD_STAGES data integrity", () => {
  it("has the six verified NWS forecast points", () => {
    expect(Object.keys(FLOOD_STAGES).sort()).toEqual([
      "01637500",
      "01638500",
      "01639000",
      "01642190",
      "01643000",
      "01643500",
    ]);
  });

  it("every gauge has monotonically increasing thresholds", () => {
    for (const [id, s] of Object.entries(FLOOD_STAGES)) {
      expect(s.action, id).toBeLessThan(s.minor);
      expect(s.minor, id).toBeLessThan(s.moderate);
      expect(s.moderate, id).toBeLessThan(s.major);
      expect(s.nws, id).toMatch(/^[A-Z]{4}\d$/);
    }
  });

  it("builds the official NWS gauge URL", () => {
    expect(nwsGaugeUrl("FDKM2")).toBe("https://water.noaa.gov/gauges/FDKM2");
  });
});

describe("worstCurrentFloodReading", () => {
  const now = new Date("2026-08-13T16:00:00.000Z");

  it("selects the worst current official category instead of the first gauge", () => {
    const result = worstCurrentFloodReading([
      {
        id: "normal",
        gageHeightFt: 4,
        floodStages: monocacyFrederick,
        observedAt: "2026-08-13T15:45:00.000Z",
      },
      {
        id: "action",
        gageHeightFt: 13.5,
        floodStages: monocacyFrederick,
        observedAt: "2026-08-13T15:40:00.000Z",
      },
      {
        id: "minor",
        gageHeightFt: 15.2,
        floodStages: monocacyFrederick,
        observedAt: "2026-08-13T15:30:00.000Z",
      },
    ], now);

    expect(result?.site.id).toBe("minor");
    expect(result?.category.key).toBe("minor");
    expect(result?.observedAt).toBe("2026-08-13T15:30:00.000Z");
  });

  it("does not promote a stale or future high-water observation as live", () => {
    const result = worstCurrentFloodReading([
      {
        id: "stale-major",
        gageHeightFt: 21,
        floodStages: monocacyFrederick,
        observedAt: "2026-08-13T12:00:00.000Z",
      },
      {
        id: "future-major",
        gageHeightFt: 21,
        floodStages: monocacyFrederick,
        observedAt: "2026-08-13T16:06:00.000Z",
      },
      {
        id: "current-normal",
        gageHeightFt: 4,
        floodStages: monocacyFrederick,
        observedAt: "2026-08-13T15:45:00.000Z",
      },
    ], now);

    expect(result?.site.id).toBe("current-normal");
    expect(result?.category.key).toBe("normal");
  });

  it("uses the gage-height timestamp rather than a newer streamflow timestamp", () => {
    const result = worstCurrentFloodReading([{
      id: "stale-height-fresh-flow",
      gageHeightFt: 21,
      floodStages: monocacyFrederick,
      observedAt: "2026-08-13T15:50:00.000Z",
      gageHistory: [{ at: "2026-08-13T12:00:00.000Z" }],
    }], now);

    expect(result).toBeNull();
  });

  it("returns the actual gage-height timestamp used for a current category", () => {
    const result = worstCurrentFloodReading([{
      id: "current-height-newer-flow",
      gageHeightFt: 13.5,
      floodStages: monocacyFrederick,
      observedAt: "2026-08-13T15:55:00.000Z",
      gageHistory: [{ at: "2026-08-13T15:30:00.000Z" }],
    }], now);

    expect(result).toMatchObject({
      category: { key: "action" },
      observedAt: "2026-08-13T15:30:00.000Z",
    });
  });

  it("requires source health and every expected forecast point before earning countywide coverage", () => {
    const currentNormal = [{
      id: "01643000",
      gageHeightFt: 4,
      floodStages: monocacyFrederick,
      observedAt: "2026-08-13T15:45:00.000Z",
    }];
    const staleNormal = [{
      ...currentNormal[0],
      id: "stale-normal",
      observedAt: "2026-08-13T12:00:00.000Z",
    }];
    const allCurrent = Object.entries(FLOOD_STAGES).map(([id, floodStages]) => ({
      id,
      gageHeightFt: Math.max(0, floodStages.action - 5),
      floodStages,
      observedAt: "2026-08-13T15:45:00.000Z",
    }));

    expect(currentFloodCoverage(false, currentNormal, now)).toEqual({
      status: "unavailable",
      worst: null,
    });
    expect(currentFloodCoverage(true, [], now)).toEqual({
      status: "incomplete",
      worst: null,
    });
    expect(currentFloodCoverage(true, staleNormal, now)).toEqual({
      status: "incomplete",
      worst: null,
    });
    expect(currentFloodCoverage(true, currentNormal, now)).toMatchObject({
      status: "incomplete",
      worst: { category: { key: "normal" } },
    });
    expect(currentFloodCoverage(true, allCurrent, now)).toMatchObject({
      status: "current",
      worst: { category: { key: "normal" } },
    });
  });
});
