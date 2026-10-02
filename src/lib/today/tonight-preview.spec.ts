import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/data/places";
import type { PlaceCardData } from "@/lib/loaders/places";
import OVERRIDES from "@/data/places-overrides.json";

type TestPlace = Place & Partial<Pick<PlaceCardData, "description_reviewed" | "description_verified_at">>;
import { loadTonightPreview } from "./tonight-preview";

const catalog = vi.hoisted(() => ({ places: [] as TestPlace[], reviews: {} as Record<string, { reviewed_at: string }> }));
vi.mock("@/lib/loaders/places", () => ({
  publicPlaces: () => catalog.places,
  decoratePlace: (place: TestPlace) => ({
    ...place, confidence: "curated", source_id: `slug:${place.slug}`,
    source_url: null, license: "First party editorial",
    first_seen_at: place.updated_at, last_verified_at: place.updated_at,
  }),
}));

vi.mock("@/lib/loaders/placeVisitDetails", () => ({
  placeVisitDetails: (slug: string) => catalog.reviews[slug] ?? null,
}));

const NOW = new Date("2026-09-30T16:00:00Z"); // noon Eastern
function place(slug: string, extra: Partial<TestPlace> = {}): TestPlace {
  return {
    slug, name: slug, category: "restaurant", short_blurb: "A catalog restaurant.",
    address: "1 Main Street", city: "Brunswick", state: "MD", postal_code: "21716",
    municipality: "brunswick", geom: { lng: -77.628, lat: 39.313 },
    is_verified: true, feature_score: 1, source: "manual", updated_at: NOW.toISOString(),
    ...extra,
  };
}

beforeEach(() => { catalog.places = []; catalog.reviews = {}; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("Tonight preview catalog model", () => {
  it("defaults to the current clock, with an upcoming Eastern evening before 6 PM", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const data = loadTonightPreview();
    expect(data.intent).toBe("dinner");
    expect(data.date).toBe("Wednesday, September 30");
    expect(data.startsAt).toBe("2026-09-30T22:00:00.000Z");
    expect(data.endsAt).toBe("2026-10-01T04:00:00.000Z");
    expect(data.windowLabel).toContain("6:00 PM to midnight Eastern");
  });

  it("starts at now in the evening, using Eastern date rather than the UTC date", () => {
    const now = new Date("2026-10-01T01:30:00Z"); // September 30, 9:30 PM Eastern
    const data = loadTonightPreview({ now });
    expect(data.startsAt).toBe(now.toISOString());
    expect(data.date).toBe("Wednesday, September 30");
    expect(data.windowLabel).toContain("from now (9:30 PM)");
    expect(data.endsAt).toBe("2026-10-01T04:00:00.000Z");
  });

  it("keeps the evening and midnight window correct in standard time", () => {
    const data = loadTonightPreview({ now: new Date("2026-11-03T17:00:00Z") });
    expect(data.startsAt).toBe("2026-11-03T23:00:00.000Z");
    expect(data.endsAt).toBe("2026-11-04T05:00:00.000Z");
  });

  it("preserves town scope and caps a deterministic ranked set at three", () => {
    catalog.places = [place("z"), place("b"), place("a"), place("c"), place("other", { municipality: "frederick" })];
    const data = loadTonightPreview({ now: NOW, town: "town:Brunswick" });
    expect(data.town).toBe("brunswick");
    expect(data.scopeLabel).toBe("Brunswick");
    expect(data.picks.map((pick) => pick.slug)).toEqual(["a", "b", "c"]);
    expect(data.picks.every((pick) => pick.town === "Brunswick")).toBe(true);
    expect(loadTonightPreview({ now: NOW, town: "rosemont" }).picks).toEqual([]);
  });

  it("supports drinks and canonical pizza evidence without unrelated categories", () => {
    catalog.places = [place("dinner"), place("pub", { category: "pub" }),
      place("pizza", { name: "Real Pizzeria", category: "restaurant" }),
      place("coffee", { category: "coffee" })];
    expect(loadTonightPreview({ now: NOW, intent: "drinks" }).picks.map((pick) => pick.slug)).toEqual(["pub"]);
    expect(loadTonightPreview({ now: NOW, intent: "pizza" }).picks.map((pick) => pick.slug)).toEqual(["pizza"]);
    expect(loadTonightPreview({ now: NOW, intent: "unsupported" }).intent).toBe("dinner");
  });

  it("uses the catalog's editorial order and description without inventing availability", () => {
    catalog.places = [place("alphabetical-first", { feature_score: 1 }), place("editorial-choice", {
      feature_score: 8,
      short_blurb: "This restaurant serves Indian food on Main Street.",
    })];
    const data = loadTonightPreview({ now: NOW });
    expect(data.picks[0].slug).toBe("editorial-choice");
    expect(data.picks[0].why).toBe("This restaurant serves Indian food on Main Street.");
    expect(data.picks[0].availabilityLabel).toBe("Hours not confirmed");
  });

  it("prefers recent reviewed evidence and useful copy over generic alphabetical ties", () => {
    catalog.places = [place("a-generic"), place("y-reviewed", {
      description_reviewed: true, description_verified_at: NOW.toISOString(),
      short_blurb: "This restaurant serves Indian food on Main Street.",
    }), place("z-practical")];
    catalog.reviews["z-practical"] = { reviewed_at: NOW.toISOString() };
    const data = loadTonightPreview({ now: NOW });
    expect(data.picks.map((pick) => pick.slug)).toEqual(["z-practical", "y-reviewed", "a-generic"]);
    expect(data.picks[1].why).toBe("This restaurant serves Indian food on Main Street.");
    expect(data.picks.every((pick) => pick.availabilityLabel === "Hours not confirmed")).toBe(true);
  });

  it("keeps trusted availability ahead of recent practical evidence", () => {
    catalog.places = [place("reviewed-unknown"), place("open-generic", {
      hours: { wed: [{ open: "17:00", close: "23:00" }] },
      hours_verified: true, hours_updated_at: NOW.toISOString(),
    })];
    catalog.reviews["reviewed-unknown"] = { reviewed_at: NOW.toISOString() };
    const data = loadTonightPreview({ now: NOW });
    expect(data.picks.map((pick) => pick.slug)).toEqual(["open-generic", "reviewed-unknown"]);
    expect(data.picks[0].availabilityLabel).toBe("Listed open at 6:00 PM");
    expect(data.picks[1].availabilityLabel).toBe("Hours not confirmed");
  });

  it("does not prefer old or future-dated reviews", () => {
    catalog.places = [place("a-generic"), place("z-old", {
      description_reviewed: true, description_verified_at: "2026-08-01T16:00:00Z",
    }), place("y-future")];
    catalog.reviews["z-old"] = { reviewed_at: "2026-08-01T16:00:00Z" };
    catalog.reviews["y-future"] = { reviewed_at: "2026-10-01T16:00:00Z" };
    expect(loadTonightPreview({ now: NOW }).picks.map((pick) => pick.slug))
      .toEqual(["a-generic", "y-future", "z-old"]);
  });

  it("uses Smoketown's reviewed kitchen role for dinner while preserving brewery and drinks", () => {
    const patch = OVERRIDES.patch["smoketown-brewing-brunswick"];
    expect(patch.subcategories).toContain("restaurant");
    catalog.places = [place("asia-star-brunswick", { short_blurb: "" }),
      place("smoketown-brewing-brunswick", {
        ...patch, category: "brewery", name: "Smoketown Brewing",
        short_blurb: "Smoketown Brewing serves beer and food, with a taproom and a dog-friendly patio.",
      })];
    catalog.reviews["smoketown-brewing-brunswick"] = { reviewed_at: NOW.toISOString() };
    const dinner = loadTonightPreview({ now: NOW, town: "brunswick", intent: "dinner" });
    expect(dinner.picks[0].slug).toBe("smoketown-brewing-brunswick");
    expect(dinner.picks[0].categoryLabel).toBe("Breweries");
    expect(dinner.picks[0].why).toContain("serves beer and food");
    expect(dinner.picks[0].availabilityLabel).toBe("Hours not confirmed");
    expect(loadTonightPreview({ now: NOW, town: "brunswick", intent: "drinks" }).picks[0].slug)
      .toBe("smoketown-brewing-brunswick");
  });

  it("never turns missing or stale hours into an availability claim", () => {
    vi.stubEnv("HOURS_FRESHNESS_ENFORCED", "1");
    catalog.places = [place("unknown"), place("stale", {
      hours: { wed: [{ open: "10:00", close: "23:00" }] },
      hours_verified: true, hours_updated_at: "2026-09-01T12:00:00Z",
    })];
    const data = loadTonightPreview({ now: NOW });
    expect(data.picks).toHaveLength(2);
    expect(data.picks.every((pick) => pick.availabilityLabel === "Hours not confirmed")).toBe(true);
    expect(data.picks.every((pick) => pick.hoursLabel === "Check with the venue before going.")).toBe(true);
  });

  it("labels future opening from fresh hours without saying Open now", () => {
    catalog.places = [place("fresh", {
      hours: { wed: [{ open: "17:00", close: "23:00" }] },
      hours_verified: true, hours_updated_at: NOW.toISOString(),
    })];
    const data = loadTonightPreview({ now: NOW });
    expect(data.picks[0].availabilityLabel).toBe("Listed open at 6:00 PM");
    expect(data.picks[0].hoursLabel).toContain("11pm");
    expect(data.picks[0].availabilityLabel).not.toContain("Open now");
    expect(loadTonightPreview({ now: new Date("2026-10-01T00:00:00Z") }).picks[0].availabilityLabel).toBe("Open now");
  });

  it("includes a later published opening but excludes closed and unavailable venues", () => {
    catalog.places = [place("later", {
      hours: { wed: [{ open: "20:00", close: "23:00" }] },
      hours_verified: true, hours_updated_at: NOW.toISOString(),
    }), place("closed", {
      hours: { wed: [{ open: "10:00", close: "17:00" }] },
      hours_verified: true, hours_updated_at: NOW.toISOString(),
    }), place("permanent", { is_operational: "closed_permanently" })];
    const data = loadTonightPreview({ now: NOW });
    expect(data.picks.map((pick) => pick.slug)).toEqual(["later"]);
    expect(data.picks[0].availabilityLabel).toBe("Listed to open at 8pm");
  });

  it("carries a validated intent and town return URL without reflecting unsafe input", () => {
    catalog.places = [place("real-pizza", { category: "pizza", website: "javascript:alert(1)" })];
    const data = loadTonightPreview({ now: NOW, town: "brunswick", intent: "pizza" });
    const href = new URL(data.picks[0].detailHref, "https://frederickradius.app");
    expect(href.pathname).toBe("/places/real-pizza");
    expect(href.searchParams.get("returnTo")).toBe("/today/tonight?intent=pizza&in=brunswick");
    expect(data.picks[0].website).toBeUndefined();
    const fallback = loadTonightPreview({ now: NOW, town: "//evil.example", intent: "<script>" });
    expect(fallback.town).toBeNull();
    expect(fallback.intent).toBe("dinner");
    expect(fallback.picks[0].detailHref).not.toContain("evil");
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(data.picks[0].image).toBeUndefined();
  });

  it("preserves Near me in return links and explicitly labels the county fallback", () => {
    catalog.places = [place("brunswick-place"), place("frederick-place", { municipality: "frederick" })];
    const data = loadTonightPreview({ now: NOW, town: "nearme" });
    expect(data.scope).toBe("nearme");
    expect(data.town).toBeNull();
    expect(data.scopeLabel).toBe("Whole county");
    expect(data.scopeNote).toContain("aren’t ranked by your location");
    expect(data.picks).toHaveLength(2);
    expect(new URL(data.picks[0].detailHref, "https://example.test").searchParams.get("returnTo"))
      .toBe("/today/tonight?intent=dinner&in=nearme");
  });
});
