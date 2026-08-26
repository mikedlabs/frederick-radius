import { describe, expect, it } from "vitest";

import { recheckHistoricalSearchMiss } from "./searchGapRecheck";

describe("historical search-miss recheck", () => {
  it("surfaces a current concrete candidate without calling the miss solved", () => {
    const result = recheckHistoricalSearchMiss("quiet place to read", "search");

    expect(result.status).toBe("candidate-to-verify");
    expect(result.candidateCount).toBeGreaterThan(0);
    expect(result.lead?.title).toMatch(/library/i);
  });

  it("keeps a query with no current deterministic answer in the active gap queue", () => {
    expect(recheckHistoricalSearchMiss("zxqv quux", "search")).toEqual({
      status: "still-empty",
      candidateCount: 0,
      lead: null,
    });
  });

  it("treats an unverified attribute match as a candidate, not a resolution", () => {
    // Radius can find bakeries, but a bakery result alone does not prove an
    // allergen claim. The status must continue to require human verification.
    const result = recheckHistoricalSearchMiss("nut free bakery", "search");

    expect(result.status).toBe("candidate-to-verify");
    expect(result.lead?.title).toBeTruthy();
  });

  it("never infers that an Ask miss is fixed from search rows alone", () => {
    expect(recheckHistoricalSearchMiss("quiet place to read", "ask")).toEqual({
      status: "ask-needs-retest",
      candidateCount: 0,
      lead: null,
    });
  });

  it("does not call an event gap current when the event archive recheck is degraded", () => {
    expect(
      recheckHistoricalSearchMiss("events tonight", "search", [], {
        eventArchiveDegraded: true,
      }),
    ).toEqual({
      status: "recheck-incomplete",
      candidateCount: 0,
      lead: null,
    });
  });
});
