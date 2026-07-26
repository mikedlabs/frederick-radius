import { describe, expect, it } from "vitest";
import {
  CIVIC_SOURCE_READINESS,
  CIVIC_SOURCE_STAGE_ORDER,
} from "./sources";

describe("civic source readiness", () => {
  it("keeps source ids and links inspectable", () => {
    const ids = CIVIC_SOURCE_READINESS.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const source of CIVIC_SOURCE_READINESS) {
      expect(source.sourceUrl).toMatch(/^https:\/\//);
      expect(source.summary).toMatch(/[.!?]$/);
      if (source.caution) expect(source.caution).toMatch(/[.!?]$/);
    }
  });

  it("does not present reviewed or discovered feeds as publishing", () => {
    expect(
      CIVIC_SOURCE_READINESS.filter(
        (source) => source.stage === "publishing",
      ).map((source) => source.id),
    ).toEqual([]);

    expect(
      CIVIC_SOURCE_READINESS.find((source) => source.id === "fcg-fixit")
        ?.stage,
    ).toBe("connected_pending");

    for (const source of CIVIC_SOURCE_READINESS.filter(
      (item) => item.topic === "Public safety",
    )) {
      expect(source.stage).toBe("review_required");
    }
  });

  it("gives every public readiness stage a stable display order", () => {
    expect(new Set(CIVIC_SOURCE_STAGE_ORDER).size).toBe(
      CIVIC_SOURCE_STAGE_ORDER.length,
    );
    for (const source of CIVIC_SOURCE_READINESS) {
      expect(CIVIC_SOURCE_STAGE_ORDER).toContain(source.stage);
    }
  });
});
