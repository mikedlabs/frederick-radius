import { describe, expect, it } from "vitest";
import type { CivicPressSourceCheck } from "@/lib/integrations/civic-press";
import { CIVIC_PRESS_SOURCES } from "@/data/civic-press-sources";
import { pressBulletinCoverage } from "./press-coverage";

const available = { degraded: false, unavailable: [] };
function checks(missing: string[]) {
  return CIVIC_PRESS_SOURCES.map((feed): CivicPressSourceCheck => ({
    ...feed, status: missing.includes(feed.id) ? "unavailable" : "empty", checkedAt: null, latestPublishedAt: null,
  }));
}

describe("coverage for local safety and road notices", () => {
  it("accepts both checked broad feeds when only the general City newsletter failed", () => {
    expect(pressBulletinCoverage({ items: [], status: "partial", sources: checks(["city_official_news"]) }, available).availability).toBe("current");
  });
  it("names which newsroom to check when one of the broad feeds failed", () => {
    const result = pressBulletinCoverage({ items: [], status: "partial", sources: checks(["county_official_news"]) }, available);
    expect(result.availability).toBe("partial");
    expect(result.note).toContain("Check the County newsroom");
  });
  it("keeps a historical total failure and an incomplete set of checks unavailable", () => {
    expect(pressBulletinCoverage({ items: [], status: "unavailable" }, { degraded: true, unavailable: ["Frederick County", "City of Frederick"] }).availability).toBe("unavailable");
    expect(pressBulletinCoverage({ items: [], status: "partial", sources: [] }, available).availability).toBe("unavailable");
  });
});
