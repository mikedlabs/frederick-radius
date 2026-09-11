import { describe, expect, it } from "vitest";
import {
  compareDecisionEvaluations,
  decisionOriginTrust,
  evaluateDecision,
  mayRankByDecisionOrigin,
  resolveDecisionAvailabilityPolicy,
} from "./core";

describe("shared decision contract", () => {
  it("keeps ranking math private while returning complete evidence-aware reasons", () => {
    const result = evaluateDecision(
      { id: "gravel-and-grind" },
      [
        {
          id: "distance",
          label: "It is close to your location.",
          points: 8,
          evidenceIds: ["device-origin"],
        },
        {
          id: "curation",
          label: "Internal quality tie-breaker.",
          points: 9,
          visible: false,
        },
        {
          id: "closed",
          label: "It is closed.",
          points: -10,
        },
      ],
    );

    expect(result.score).toBe(7);
    expect(result.reasons).toEqual([
      {
        id: "distance",
        label: "It is close to your location.",
        evidenceIds: ["device-origin"],
      },
    ]);
  });

  it("orders evaluations by score and then by a deterministic surface tie-breaker", () => {
    const a = evaluateDecision({ name: "B" }, []);
    const b = evaluateDecision({ name: "A" }, []);
    expect(
      [a, b]
        .sort((left, right) =>
          compareDecisionEvaluations(left, right, (x, y) =>
            x.name.localeCompare(y.name),
          ),
        )
        .map((row) => row.candidate.name),
    ).toEqual(["A", "B"]);
  });

  it("never turns thin hours coverage into a countywide closure claim", () => {
    expect(
      resolveDecisionAvailabilityPolicy({
        requested: "required",
        hasSufficientCoverage: false,
        thinCoverageBehavior: "lead",
      }),
    ).toMatchObject({
      hardAvailability: false,
      mayAssertNoneOpen: false,
      ordering: "open-first",
    });
    expect(
      resolveDecisionAvailabilityPolicy({
        requested: "required",
        hasSufficientCoverage: false,
        thinCoverageBehavior: "nudge",
      }),
    ).toMatchObject({
      hardAvailability: false,
      mayAssertNoneOpen: false,
      ordering: "open-nudge",
    });
  });

  it("distinguishes a deliberate origin from a network estimate", () => {
    expect(decisionOriginTrust("device")).toBe("precise");
    expect(decisionOriginTrust("town")).toBe("chosen");
    expect(decisionOriginTrust("ip")).toBe("approximate");
    expect(mayRankByDecisionOrigin("home")).toBe(true);
    expect(mayRankByDecisionOrigin("ip")).toBe(false);
    expect(mayRankByDecisionOrigin("county")).toBe(false);
  });
});
