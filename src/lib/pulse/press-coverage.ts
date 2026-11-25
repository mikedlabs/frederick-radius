import type { CivicPressResult, OfficialCivicNewsResult } from "@/lib/integrations/civic-press";

/** Public safety and road notices use the two broad subscriptions. The City’s
 * general news subscription cannot establish coverage for either publisher. */
export function pressBulletinCoverage(news: OfficialCivicNewsResult, health: CivicPressResult["sourceHealth"]) {
  function unavailable(id: "city_official_releases" | "county_official_news", name: "City of Frederick" | "Frederick County") {
    if (!news.sources) return health.unavailable.includes(name) || (health.degraded && health.unavailable.length === 0);
    const check = news.sources.find((source) => source.id === id);
    return !check || check.status === "unavailable";
  }
  const cityMissing = unavailable("city_official_releases", "City of Frederick");
  const countyMissing = unavailable("county_official_news", "Frederick County");
  if (cityMissing && countyMissing) {
    return { availability: "unavailable", note: "Check the City and County newsrooms for the latest releases." } as const;
  }
  if (cityMissing || countyMissing) {
    return { availability: "partial", note: cityMissing
      ? "County releases are available. Check the City newsroom for city updates."
      : "City releases are available. Check the County newsroom for county updates." } as const;
  }
  return { availability: "current", note: null } as const;
}
