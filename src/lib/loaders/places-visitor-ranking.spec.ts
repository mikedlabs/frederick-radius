import { describe, expect, it, vi } from "vitest";
import type { Place } from "@/data/places";

const fixtures = vi.hoisted((): Place[] => [
  { slug: "visitor-tie-z", name: "Amber Cup", category: "coffee" },
  { slug: "visitor-brewery", name: "Juniper Brewing", category: "brewery" },
  { slug: "visitor-tie-a", name: "Canal Roast", category: "coffee" },
  { slug: "visitor-tie-m", name: "Orchard Beans", category: "coffee" },
].map((place, index): Place => ({
  ...place,
  source: "manual", is_verified: true,
  address: `${index + 1} Fixture Street`, city: "Frederick", state: "MD", postal_code: "21701", municipality: "frederick",
  geom: { lng: -77.4105 + index * 0.001, lat: 39.4143 },
  short_blurb: "Fictional ranking acceptance fixture.", tags: [],
  feature_score: 5, is_operational: "operational", updated_at: "2026-01-01",
})));

vi.mock("@/data/places", async () => ({
  ...await vi.importActual<typeof import("@/data/places")>("@/data/places"),
  PLACES: fixtures,
}));

import { momentFitScore, rankPlaces } from "./places";

const tiedCoffee = ["visitor-tie-z", "visitor-tie-a", "visitor-tie-m"];

describe("visitor ranking order and daypart boundaries", () => {
  it("keeps equal-score source order instead of adding a name or slug tiebreak", () => {
    const morning = new Date("2026-07-15T09:59:59.999-04:00");
    const ranked = rankPlaces({ profile: "visitor", now: morning });
    expect(ranked.map(place => place.slug)).toEqual([...tiedCoffee, "visitor-brewery"]);
    expect(ranked.every(place => place.open_status.state === "unknown")).toBe(true);
  });

  it("retains tie order after filtering and applies the limit after ranking", () => {
    const now = new Date("2026-07-15T09:00:00-04:00");
    expect(rankPlaces({ profile: "visitor", now, category: "coffee" }).map(place => place.slug))
      .toEqual(tiedCoffee);
    expect(rankPlaces({ profile: "visitor", now, category: "coffee", limit: 2 }).map(place => place.slug))
      .toEqual(tiedCoffee.slice(0, 2));
  });

  it("ranks a brewery ahead of otherwise equal coffee records in the evening", () => {
    expect(rankPlaces({ profile: "visitor", now: new Date("2026-07-15T16:00:00-04:00") })
      .map(place => place.slug)).toEqual(["visitor-brewery", ...tiedCoffee]);
  });

  it.each([
    ["2026-01-15T09:59:59.999-05:00", 1, 0.6, 0.6],
    ["2026-01-15T10:00:00-05:00", 1, 1, 0.6],
    ["2026-01-15T15:59:59.999-05:00", 1, 1, 0.6],
    ["2026-01-15T16:00:00-05:00", 0.6, 1, 1],
    ["2026-07-15T09:59:59.999-04:00", 1, 0.6, 0.6],
    ["2026-07-15T10:00:00-04:00", 1, 1, 0.6],
    ["2026-07-15T15:59:59.999-04:00", 1, 1, 0.6],
    ["2026-07-15T16:00:00-04:00", 0.6, 1, 1],
    ["2026-07-16T00:00:00-04:00", 1, 0.6, 0.6],
  ] as const)("uses the exact Eastern instant %s", (instant, coffee, restaurant, brewery) => {
    const now = new Date(instant);
    expect(momentFitScore("coffee", now)).toBe(coffee);
    expect(momentFitScore("restaurant", now)).toBe(restaurant);
    expect(momentFitScore("brewery", now)).toBe(brewery);
    expect(momentFitScore("hardware", now)).toBe(0.6);
  });

  it("formats every supplied Date value even when the same Date object changes", () => {
    const clock = new Date("2026-07-15T15:59:59.999-04:00");
    expect(momentFitScore("coffee", clock)).toBe(1);
    clock.setTime(clock.getTime() + 1);
    expect(momentFitScore("coffee", clock)).toBe(0.6);
  });
});
