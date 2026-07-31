import { describe, it, expect } from "vitest";
import {
  isHighConfidenceCivicIntent,
  searchCivicActions,
  shouldShowDepartmentAnswers,
} from "./civic";

/**
 * The "how do I…" slice of the everything search. The live failure this
 * guards: "report a pothole" ranked a church, "animal control" a winery —
 * the county's own How-Do-I corpus was invisible to the search box.
 */
describe("searchCivicActions", () => {
  it("'report a pothole' finds FixIT, the county's own reporting door", () => {
    const r = searchCivicActions("report a pothole");
    expect(r[0]?.title).toMatch(/FixIT/i);
    expect(r[0]?.href).toContain("frederickcountymd.gov");
  });

  it("'voter registration' leads with the registration link", () => {
    expect(searchCivicActions("voter registration")[0]?.title).toMatch(/voter registration/i);
  });

  it("'marriage license' resolves the courts link", () => {
    expect(searchCivicActions("marriage license")[0]?.title).toMatch(/marriage/i);
  });

  it("'road closures' resolves the county closures page", () => {
    expect(searchCivicActions("road closures")[0]?.title).toMatch(/road closures/i);
  });

  it("'burn permit' resolves the health-department permit", () => {
    expect(searchCivicActions("burn permit")[0]?.title).toMatch(/burn permit/i);
  });

  it("place-shaped and noise queries never surface an action", () => {
    expect(searchCivicActions("coffee near me")).toEqual([]);
    expect(searchCivicActions("frederick")).toEqual([]);
    expect(searchCivicActions("best brunch downtown")).toEqual([]);
  });

  it("answers natural voter-registration language with the official task", () => {
    const results = searchCivicActions("how do I register to vote");
    expect(results[0]).toMatchObject({
      id: "civic:register-vote",
      title: "Voter registration",
      href: "https://frederickcountymd.gov/1648/Voter-Registration---RegisterMake-Change",
    });
  });

  it("answers property tax with the official county payment task", () => {
    expect(searchCivicActions("property tax")[0]).toMatchObject({ id: "civic:pay-bills" });
  });

  it.each(["food permit", "health inspection"])(
    "answers '%s' with Frederick County Food Control",
    (query) => {
      expect(searchCivicActions(query)[0]).toMatchObject({ id: "civic:food-license" });
    },
  );

  it("does not mistake a health-food search for a Food Control task", () => {
    expect(searchCivicActions("health food")).toEqual([]);
  });
});

describe("isHighConfidenceCivicIntent", () => {
  it.each([
    "report a pothole",
    "how do I register to vote",
    "water bill",
    "bus schedule",
    "animal control",
    "property zoning",
  ])("treats '%s' as a complete civic task", (query) => {
    expect(isHighConfidenceCivicIntent(query, searchCivicActions(query))).toBe(true);
  });

  it.each([
    "dog friendly restaurant",
    "water park",
    "health food",
    "bus station",
  ])("keeps local results for mixed query '%s'", (query) => {
    expect(isHighConfidenceCivicIntent(query, searchCivicActions(query))).toBe(false);
  });

  it("never suppresses local results when no authoritative action exists", () => {
    expect(isHighConfidenceCivicIntent("property tax", [])).toBe(false);
  });
});

describe("shouldShowDepartmentAnswers", () => {
  it.each([
    "dog friendly restaurant",
    "health food",
    "water park",
    "bus station",
    "dog park",
  ])("keeps department hint noise out of local search '%s'", (query) => {
    expect(shouldShowDepartmentAnswers(query, searchCivicActions(query))).toBe(false);
  });

  it.each([
    "dog license",
    "stray dog",
    "water outage",
    "parking ticket",
    "who should I call about a street light",
  ])("keeps a department fallback for genuine civic request '%s'", (query) => {
    expect(shouldShowDepartmentAnswers(query, searchCivicActions(query))).toBe(true);
  });

  it("shows the verified MVA department answer for a bare DMV shortcut", () => {
    expect(shouldShowDepartmentAnswers("DMV", [])).toBe(true);
    expect(shouldShowDepartmentAnswers("MVA", [])).toBe(true);
  });

  it.each([
    "how do I register to vote",
    "food permit",
    "health inspection",
    "property tax",
    "report a pothole",
  ])("lets the direct official task own '%s' without a generic department", (query) => {
    const answers = searchCivicActions(query);
    expect(answers.length).toBeGreaterThan(0);
    expect(shouldShowDepartmentAnswers(query, answers)).toBe(false);
  });
});
