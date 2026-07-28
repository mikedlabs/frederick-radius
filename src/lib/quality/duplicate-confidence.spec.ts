import { describe, expect, it } from "vitest";
import { classifyDuplicateConfidence } from "./duplicate-confidence";

const strongCandidate = {
  jaccard: 0.8,
  meters: 20,
  coreOverlap: 2,
  distinctTokenConflict: false,
  categoryConflict: false,
  providerMatch: true,
  providerConflict: false,
};

describe("duplicate confidence", () => {
  it("requires a matching provider identity before calling a pair HIGH", () => {
    expect(classifyDuplicateConfidence(strongCandidate)).toBe("HIGH");
    expect(
      classifyDuplicateConfidence({
        ...strongCandidate,
        providerMatch: false,
      }),
    ).toBe("MEDIUM");
  });

  it("never auto-merges records with different provider identities", () => {
    expect(
      classifyDuplicateConfidence({
        ...strongCandidate,
        providerMatch: false,
        providerConflict: true,
      }),
    ).toBe("LOW");
  });

  it("keeps category and sub-feature conflicts out of HIGH", () => {
    expect(
      classifyDuplicateConfidence({
        ...strongCandidate,
        categoryConflict: true,
      }),
    ).toBe("MEDIUM");
    expect(
      classifyDuplicateConfidence({
        ...strongCandidate,
        distinctTokenConflict: true,
      }),
    ).toBe("LOW");
  });
});
