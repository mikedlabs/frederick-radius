import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same reviewed-hours fixture as answer.spec.ts, so ranking never depends on
// whichever production schedules happen to be fresh today.
vi.mock("@/data/places-client-hours.json", async () => ({
  default: (await import("../../../tests/fixtures/ask-reviewed-hours.json")).default,
}));
vi.mock("@/data/places-client.json", async (importOriginal) => {
  const original = await importOriginal<{ default: Array<{ slug: string }> }>();
  const hours = (await import("../../../tests/fixtures/ask-reviewed-hours.json")).default;
  const bySlug = new Map(hours.map((row) => [row.slug, row]));
  return { default: original.default.map((place) => ({ ...place, ...bySlug.get(place.slug) })) };
});

import {
  askBrowseNoun,
  askFrederick,
  categoryFirstRows,
  explicitWantCategory,
  withAskSourcePoints,
} from "./answer";
import type { AskResult } from "./contracts";

const POP_SHOP = "north-market-pop-shop-frederick";

describe("explicit category ranking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // A Tuesday mid-morning, when a coffee question is ordinary.
    vi.setSystemTime(new Date("2026-10-06T14:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps coffee shops ahead of an ice-cream and soda shop for a quiet downtown work session", async () => {
    const result = await askFrederick("quiet coffee shop to work downtown", {});
    const slugs = result.sources.map((source) => source.slug);

    // The audit miss: North Market Pop Shop ranked third and Gravel & Grind
    // was pushed behind "Show more".
    expect(slugs.slice(0, 3)).toContain("gravel-and-grind-frederick");
    const lastCoffee = result.sources.reduce(
      (last, source, index) => (source.category === "coffee" ? index : last),
      -1,
    );
    const popShop = slugs.indexOf(POP_SHOP);
    if (popShop >= 0) {
      expect(popShop).toBeGreaterThan(lastCoffee);
      expect(result.sources[popShop].eyebrow).toBe("Alternative · Ice cream & treats");
    }
    // Every off-category row is labeled; on-category rows are not.
    for (const source of result.sources) {
      expect(source.eyebrow?.startsWith("Alternative")).toBe(source.category !== "coffee");
    }
  });

  it("names the browse action with a countable noun", async () => {
    const result = await askFrederick("quiet coffee shop to work downtown", {});
    expect(result.actions?.[0]?.label).toMatch(/^See all \d+ coffee shops$/);
  });

  it("gives every catalog place a map point for the numbered results map", async () => {
    const result = await askFrederick("quiet coffee shop to work downtown", {});
    const places = result.sources.filter((source) => source.href.startsWith("/places/"));
    expect(places.length).toBeGreaterThan(0);
    for (const source of places) {
      expect(source.geom?.lat).toBeGreaterThan(39);
      expect(source.geom?.lng).toBeLessThan(-77);
    }
  });
});

describe("categoryFirstRows", () => {
  const categories: Record<string, string> = {
    ibiza: "coffee",
    "pop-shop": "ice-cream",
    gravel: "coffee",
    nola: "restaurant",
  };
  const rows = [{ slug: "ibiza" }, { slug: "pop-shop" }, { slug: "nola" }, { slug: "gravel" }];

  it("moves other categories behind every on-category row and remembers them", () => {
    const { rows: ordered, alternatives } = categoryFirstRows(
      rows,
      "coffee",
      (slug) => categories[slug] ?? null,
    );
    expect(ordered.map((row) => row.slug)).toEqual(["ibiza", "gravel", "pop-shop", "nola"]);
    expect([...alternatives]).toEqual(["pop-shop", "nola"]);
  });

  it("leaves broad requests untouched", () => {
    const { rows: ordered, alternatives } = categoryFirstRows(
      rows,
      null,
      (slug) => categories[slug] ?? null,
    );
    expect(ordered).toEqual(rows);
    expect(alternatives.size).toBe(0);
  });

  it("treats only single-category cravings as explicit", () => {
    expect(explicitWantCategory("coffee")).toBe("coffee");
    expect(explicitWantCategory("ice-cream")).toBe("ice-cream");
    expect(explicitWantCategory("breweries")).toBe("brewery");
    // Meals and broad cravings span several categories on purpose.
    expect(explicitWantCategory("breakfast")).toBeNull();
    expect(explicitWantCategory("drinks")).toBeNull();
    expect(explicitWantCategory("food")).toBeNull();
  });
});

describe("askBrowseNoun", () => {
  it.each([
    ["Coffee", null, "coffee shops"],
    ["Ice cream", null, "ice cream shops"],
    ["Food", null, "places to eat"],
    ["Breweries", null, "breweries"],
    ["Breakfast", null, "breakfast spots"],
    ["Family fun", null, "places for family fun"],
    ["Wellness", null, "places for wellness"],
    ["Salons & barbers", null, "salons & barbers"],
    ["Food", "thai", "Thai places"],
    ["Dinner", "thai", "Thai places for dinner"],
  ])("reads %s (%s) as %s", (label, cuisine, noun) => {
    expect(askBrowseNoun(label, cuisine)).toBe(noun);
  });
});

describe("withAskSourcePoints", () => {
  const base: AskResult = {
    status: "matches",
    configured: true,
    usedModel: false,
    answer: "Gravel & Grind is the best match for coffee.",
    sources: [],
  };

  it("adds the catalog point to place sources from any answer path", () => {
    const result = withAskSourcePoints({
      ...base,
      sources: [
        {
          slug: "gravel-and-grind-frederick",
          name: "Gravel & Grind",
          category: "coffee",
          href: "/places/gravel-and-grind-frederick?from=ask",
        },
        {
          slug: "vote",
          name: "Voter registration",
          category: "civic",
          href: "https://frederickcountymd.gov/vote",
        },
      ],
    });
    expect(result.sources[0].geom).toEqual({ lng: -77.409217, lat: 39.4216984 });
    expect(result.sources[1].geom).toBeUndefined();
  });

  it("keeps a point an event source already carries and returns untouched results as-is", () => {
    const event = {
      slug: "alive-at-five",
      name: "Alive at Five",
      category: "music",
      href: "/events/alive-at-five",
      geom: { lng: -77.41, lat: 39.414 },
    };
    const untouched = { ...base, sources: [event] };
    expect(withAskSourcePoints(untouched)).toBe(untouched);
  });
});
