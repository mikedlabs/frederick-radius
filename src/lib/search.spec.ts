import { describe, it, expect, vi } from "vitest";
import { qualifiedSearch, search } from "./search";
import type { Event } from "@/data/events";

/**
 * Guards the natural-language relevance of the shared search core, which the
 * Ask box feeds raw ("i need a hotel"). The bug (owner catch, Jul 2026): a lone
 * "i" prefix-matched every place starting with "I", so the Ask source cards
 * were Ibiza Cafe, In Fit, Inbloom, Iglesia La Luz Del Mundo... a mixed bag
 * with one actual hotel. normalize now drops single-char + filler tokens, and a
 * lodging intent boosts the lodging category.
 */
describe("search — natural-language 'i need a hotel'", () => {
  const hits = search("i need a hotel", 8);
  const places = hits.filter((h) => h.type === "place") as Extract<
    ReturnType<typeof search>[number],
    { type: "place" }
  >[];

  it("returns at least one place", () => {
    expect(places.length).toBeGreaterThan(0);
  });

  it("leads with a lodging place, not an incidental 'I' name match", () => {
    // The top place must be lodging (the intent boost + the killed 'i' noise).
    expect(places[0]?.place.category).toBe("lodging");
  });

  it("does not surface the old junk (cafe / gym / jewelry / faith) in the top hits", () => {
    const cats = new Set(places.map((p) => p.place.category));
    for (const junk of ["cafe", "coffee", "gym", "jewelry", "faith"]) {
      expect(cats.has(junk)).toBe(false);
    }
  });
});

describe("search — normalize drops noise but keeps real keywords", () => {
  it("a plain keyword still works", () => {
    const hits = search("coffee", 5);
    expect(hits.some((h) => h.type === "place")).toBe(true);
  });

  it("filler-only queries return nothing rather than everything", () => {
    // "i need a" is pure filler + a single char -> no terms -> no hits.
    expect(search("i need a", 5)).toHaveLength(0);
  });
});

describe("qualifiedSearch — event intent survives location language", () => {
  const concert: Event = {
      slug: "future-live-show",
      title: "Live Jazz on the Creek",
      description: "A live music performance.",
      starts_at: "2099-07-15T23:00:00.000Z",
      ends_at: "2099-07-16T01:00:00.000Z",
      timezone: "America/New_York",
      venue_name: "Creek Stage",
      address: "1 Market St",
      geom: { lng: -77.4105, lat: 39.4143 },
      municipality: "frederick",
      category: "music",
      audience: [],
      is_free: true,
      source: "manual",
      is_verified: true,
  };

  const context = {
      origin: { lng: -77.4105, lat: 39.4143 },
      municipality: "frederick",
  };

  for (const query of ["events near me", "live music near me", "concerts near me", "open mic near me"]) {
    it(`keeps live events for '${query}' without padding with arbitrary nearest places`, () => {
      const { hits } = qualifiedSearch(query, 20, [concert], context);
      expect(hits.some((hit) => hit.type === "event" && hit.event.slug === concert.slug)).toBe(true);
      const placeNames = hits.flatMap((hit) => hit.type === "place" ? [hit.place.name] : []);
      expect(placeNames).not.toContain("PNC Bank");
    });
  }

  it("ranks geo-precise events nearest-first when the query says near me", () => {
    const far = {
      ...concert,
      slug: "far-live-show",
      title: "Live Jazz Far Away",
      geom: { lng: -77.62, lat: 39.31 },
      municipality: "brunswick",
    };
    const { hits } = qualifiedSearch("events near me", 20, [far, concert], {
      origin: context.origin,
    });
    const events = hits.flatMap((hit) => hit.type === "event" ? [hit.event.slug] : []);
    expect(events.slice(0, 2)).toEqual([concert.slug, far.slug]);
  });
});

describe("qualifiedSearch — natural category plurals", () => {
  it("finds open restaurants for the exact conversational query", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T16:00:00.000Z"));
    try {
      const { hits } = qualifiedSearch("restaurants open now near me", 20, undefined, {
        origin: { lng: -77.4105, lat: 39.4143 },
      });
      const places = hits.flatMap((hit) => hit.type === "place" ? [hit.place] : []);
      expect(places.length).toBeGreaterThan(0);
      expect(places.every((place) => place.category === "restaurant")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
