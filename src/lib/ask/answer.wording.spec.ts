import { describe, expect, it } from "vitest";
import { deterministicAnswer } from "./answer";

describe("deterministic Ask wording", () => {
  it("agrees with a single wording match", () => {
    expect(deterministicAnswer({ count: 1 })).toBe(
      "I found 1 result that matches the wording of your request.",
    );
  });

  it("keeps the plural wording for several matches", () => {
    expect(deterministicAnswer({ count: 3 })).toBe(
      "I found 3 results that match the wording of your request.",
    );
  });

  it("never pairs a singular count with a plural verb", () => {
    for (const count of [1, 2, 7]) {
      const line = deterministicAnswer({ count });
      expect(line).not.toMatch(/\b1 results?\b that match\b/);
      expect(line).not.toMatch(/\b(?:[2-9]|\d{2,}) result\b/);
    }
  });

  it("asks whether one reservation match is bookable instead of which are", () => {
    expect(deterministicAnswer({ count: 1, reservation: true })).toContain(
      "This is the 1 catalog match with actual evidence for your request; use OpenTable to check whether it is bookable.",
    );
    expect(
      deterministicAnswer({ count: 2, reservation: true, requestedTime: "7 PM" }),
    ).toContain(
      "These are the 2 catalog matches with actual evidence for your request; use OpenTable to check which are bookable at 7 PM.",
    );
  });
});
