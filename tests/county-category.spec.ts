import { describe, it, expect } from "vitest";
import { feedCategory } from "@/lib/integrations/ical-live";

const feed = (o: Record<string, unknown>) =>
  o as unknown as Parameters<typeof feedCategory>[0];

/**
 * P0-5 Option A: county-feed events get no category (no badge) rather
 * than a wrong one. Other feeds keep keyword inference with fallback.
 */
describe("feedCategory", () => {
  it("drops the category for the county feed", () => {
    const county = feed({ source: "county", default_category: "civic" });
    expect(feedCategory(county, "Earth, Wheels, & Fire 54th Anniversary", "")).toBe("");
    expect(feedCategory(county, "Local Management Board", "")).toBe("");
    expect(feedCategory(county, "FSK Post 11 Memorial Day Observation", "")).toBe("");
  });

  it("keeps keyword inference for non-county feeds", () => {
    const celebrate = feed({ source: "celebrate", default_category: "arts" });
    expect(feedCategory(celebrate, "Live music concert with a band", "")).not.toBe("");
    expect(feedCategory(celebrate, "An unremarkable listing", "")).toBe("arts");
  });
});
