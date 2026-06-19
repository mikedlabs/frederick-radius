import { describe, it, expect } from "vitest";
import { classifyFlood, FLOOD_STAGES, nwsGaugeUrl } from "@/lib/integrations/floodStage";

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
