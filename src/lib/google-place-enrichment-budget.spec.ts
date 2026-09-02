import { describe, expect, it } from "vitest";
import { googlePlaceEnrichmentDailyCap } from "./google-place-enrichment-budget";

describe("Google place enrichment budgets", () => {
  it("keeps the route's safe defaults", () => {
    expect(googlePlaceEnrichmentDailyCap("basic", "")).toBe(10);
    expect(googlePlaceEnrichmentDailyCap("experience", "invalid")).toBe(5);
  });

  it("shares the route's immutable caps with the cost dashboard", () => {
    expect(googlePlaceEnrichmentDailyCap("basic", "9999")).toBe(80);
    expect(googlePlaceEnrichmentDailyCap("experience", "9999")).toBe(20);
    expect(googlePlaceEnrichmentDailyCap("basic", "0")).toBe(1);
    expect(googlePlaceEnrichmentDailyCap("experience", "0")).toBe(1);
  });
});
