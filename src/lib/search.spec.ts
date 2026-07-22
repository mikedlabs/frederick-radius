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

  it("does not treat Frederick location language as evidence for unknown terms", () => {
    const { hits } = qualifiedSearch(
      "Where can I buy zxqv quux near Frederick?",
      12,
      undefined,
      { origin: { lng: -77.4109, lat: 39.4137 } },
    );
    expect(hits).toHaveLength(0);
  });

  it("still resolves a real business name that includes Frederick", () => {
    expect(
      search("Frederick Bodywork", 5).some(
        (hit) => hit.type === "place" && hit.place.slug === "frederick-bodywork",
      ),
    ).toBe(true);
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

describe("qualifiedSearch — Ask uses place context by default", () => {
  const gravelAndGrind = { lng: -77.40955, lat: 39.42165 };

  it("puts a nearby place that satisfies every concept ahead of a generic chain", () => {
    const { hits } = qualifiedSearch("coffee and bikes", 12, undefined, {
      origin: gravelAndGrind,
      municipality: "frederick",
      contextLabel: "your location",
      canShowDistance: true,
    });
    const places = hits.flatMap((hit) => hit.type === "place" ? [hit.place] : []);

    expect(places[0]?.slug).toBe("gravel-and-grind-frederick");
    expect(places[0]?.distance_m).toBeLessThan(50);
    const lead = hits.find((hit) => hit.type === "place");
    expect(lead?.type === "place" ? lead.conceptCoverage : null).toEqual({ matched: 2, total: 2 });
    expect(places.findIndex((place) => /^starbucks\b/i.test(place.name))).toBeGreaterThan(0);
  });

  it("understands ordinary plurals when the curated tag is singular", () => {
    const places = search("coffee and bikes", 12)
      .flatMap((hit) => hit.type === "place" ? [hit.place] : []);

    expect(places[0]?.slug).toBe("gravel-and-grind-frederick");
  });

  it("uses location for an ordinary relevant query without requiring the word nearest", () => {
    const places = qualifiedSearch("coffee", 12, undefined, {
      origin: gravelAndGrind,
      municipality: "frederick",
      contextLabel: "your location",
      canShowDistance: true,
    }).hits.flatMap((hit) => hit.type === "place" ? [hit.place] : []);

    expect(places[0]?.distance_m).toBeLessThan(1_000);
  });

  it("hard-filters an unconstrained search to the selected town", () => {
    const { hits, meta } = qualifiedSearch("MZ Art Studio", 12, undefined, {
      origin: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      contextLabel: "Urbana",
      canShowDistance: false,
    });
    const places = hits.flatMap((hit) => hit.type === "place" ? [hit.place] : []);

    expect(meta.qualifiers.constrained).toBe(false);
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((place) => place.municipality === "urbana")).toBe(true);
  });

  it("answers a downtown breakfast-sandwich request with downtown matches, not Brunswick", () => {
    const { hits, meta } = qualifiedSearch(
      "Where can I get a breakfast sandwich?",
      12,
      undefined,
      {
        origin: { lng: -77.4109, lat: 39.4137 },
        contextLabel: "Near you",
      },
    );
    const places = hits.flatMap((hit) => hit.type === "place" ? [hit.place] : []);

    expect(meta.qualifiers).toMatchObject({
      compoundIntent: "breakfast-sandwich",
      categoryLabel: "a breakfast sandwich",
    });
    expect(meta.contextLabel).toBe("Near you");
    expect(places[0]?.slug).toBe("beans-bagels-frederick");
    expect(places[0]?.distance_m).toBeLessThan(250);
    expect(places.slice(0, 3).some((place) => place.municipality === "brunswick")).toBe(false);
    expect(places.slice(0, 3).some((place) => place.category === "pizza")).toBe(false);
  });

  it("does not let reservation language or proximity invent steak matches", () => {
    const { hits, meta } = qualifiedSearch(
      "i want a steak dinner tonight use open table to make a rev for 7:30pm tonight",
      12,
      undefined,
      {
        origin: { lng: -77.4109, lat: 39.4137 },
        municipality: "frederick",
        contextLabel: "Downtown Frederick",
      },
    );
    const places = hits.flatMap((hit) => hit.type === "place" ? [hit.place] : []);

    expect(meta.qualifiers.cleanedQuery).toBe("a steak dinner");
    // Real Japanese steakhouses (hibachi) now sit in the catalog alongside
    // Avery's grille; all three are genuine steak matches, which is the
    // opposite of the invented match this guards against.
    expect(places.map((place) => place.slug)).toEqual([
      "miyako-japanese-steak-and-seafood-frederick",
      "matsutake-sushi-and-steak-frederick",
      "averys-maryland-grille-frederick",
    ]);
    expect(places.every((place) => place.category === "restaurant")).toBe(true);
  });
});

describe("qualifiedSearch — county regions are real geographic constraints", () => {
  const query = "I've eaten pretty much all of DTF, central and eastern Frederick. But you don't hear about the other parts of the county. Curious if there are good spots in the northern or western portion of the county?";

  it("returns dining places from north and west, never central Frederick", () => {
    const { hits, meta } = qualifiedSearch(query, 20, undefined, {
      origin: { lng: -77.4105, lat: 39.4143 },
      municipality: "frederick",
      contextLabel: "Downtown Frederick",
    });
    const places = hits.flatMap((hit) => hit.type === "place" ? [hit.place] : []);
    const municipalities = new Set(places.map((place) => place.municipality));

    expect(meta.qualifiers).toMatchObject({ categoryKey: "food", regions: ["north", "west"] });
    expect(meta.contextLabel).toBe("North + West Frederick County");
    expect(places.length).toBeGreaterThan(0);
    expect(municipalities.has("frederick")).toBe(false);
    expect([...municipalities].some((town) => ["thurmont", "emmitsburg", "woodsboro", "walkersville"].includes(town))).toBe(true);
    expect([...municipalities].some((town) => ["middletown", "myersville", "brunswick", "burkittsville", "rosemont"].includes(town))).toBe(true);
    expect(places.every((place) => ["restaurant", "food-truck", "pizza"].includes(place.category))).toBe(true);
  });

  it("removes direction words before ranking so North Frederick names cannot hijack the answer", () => {
    const { hits } = qualifiedSearch("Take me somewhere worth the drive north or west of Frederick", 12, undefined, {
      origin: { lng: -77.4105, lat: 39.4143 },
    });
    const names = hits.flatMap((hit) => hit.type === "place" ? [hit.place.name] : []);
    expect(names).not.toContain("North Frederick Elementary School Pta");
    expect(names.every((name) => !/elementary school pta/i.test(name))).toBe(true);
  });
});

/**
 * App-page registry hits — the app's own guides answer their nouns.
 * "public restroom" → Amenities, "post office" → Shipping: before this,
 * those queries could only return fuzzy place matches.
 */
describe("search — app-page guides", () => {
  const topPage = (q: string) => {
    const h = search(q, 10).find((x) => x.type === "page");
    return h?.type === "page" ? h.page.href : null;
  };

  it("everyday needs resolve to the right guide", () => {
    expect(topPage("public restroom")).toBe("/amenities");
    expect(topPage("post office")).toBe("/shipping");
    expect(topPage("power outage")).toBe("/pulse");
    expect(topPage("happy hour")).toBe("/happy-hour");
    expect(topPage("covered bridges")).toBe("/markers");
  });

  it("the guide leads its own noun above keyword place matches", () => {
    const hits = search("brunch", 10);
    const pageIdx = hits.findIndex((h) => h.type === "page" && h.page.href === "/brunch");
    expect(pageIdx).toBeGreaterThanOrEqual(0);
    const firstPlaceIdx = hits.findIndex((h) => h.type === "place");
    if (firstPlaceIdx >= 0) expect(pageIdx).toBeLessThan(firstPlaceIdx);
  });

  it("unrelated queries surface no page rows", () => {
    expect(search("pizza", 10).some((h) => h.type === "page")).toBe(false);
  });
});
