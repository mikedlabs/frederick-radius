import { describe, expect, it, vi } from "vitest";
import { qualifiedSearchIndex, searchIndex } from "./index";
import { findDepartments } from "@/data/departments";
import { isPaidGooglePhotoUrl } from "@/lib/google-photo-policy";
import * as placeLoader from "@/lib/loaders/places-client";

describe("deterministic map search actions", () => {
  it("does not hand paid Google photos to live search suggestions", () => {
    const results = searchIndex("Cugino Forno", 12, []);
    const exact = results.find(
      (result) => result.id === "place:cugino-forno-frederick",
    );

    expect(exact).toBeDefined();
    expect(exact?.thumbnail).toBeUndefined();
    expect(
      results.some((result) => isPaidGooglePhotoUrl(result.thumbnail)),
    ).toBe(false);
  });

  it.each([
    ["trash cans near me", "/map?amenity=trash"],
    ["public restrooms", "/map?amenity=restroom"],
    ["drinking water", "/map?amenity=water"],
    ["dog bags", "/map?amenity=dog"],
    ["public Wi-Fi", "/map?amenity=wifi"],
    ["EV", "/map?amenity=ev"],
    ["ATM near me", "/map?q=ATM"],
    ["power outlets", "/map?amenity=outlet"],
    ["parking", "/map?show=parking"],
    ["bus stops", "/map?show=transit"],
    ["buses now", "/map?scene=buses-now"],
    ["roads now", "/map?scene=roads-now"],
    ["outside now", "/map?scene=outside-now"],
    ["what changed", "/map?scene=what-changed"],
    ["within 15 minutes", "/map?mode=radius&minutes=15"],
    ["weather radar", "/map?show=radar"],
    ["traffic cameras", "/map?show=cameras"],
    ["traffic incidents", "/map?show=incidents"],
    ["hiking trails", "/map?show=trails"],
    ["tonight", "/map?t=tonight"],
    ["events this weekend", "/map?t=weekend"],
  ])("leads %s with %s", (query, href) => {
    const results = qualifiedSearchIndex(query, 8, []).results;
    expect(results[0]).toMatchObject({
      type: "action",
      href,
    });
  });

  it("does not confuse parking with the parks layer", () => {
    const parking = searchIndex("parking", 12, []);
    const parkingVerb = searchIndex("where can I park downtown", 12, []);

    expect(parking[0]?.href).toBe("/map?show=parking");
    expect(parkingVerb[0]?.href).toBe("/map?show=parking");
    expect([...parking, ...parkingVerb].some((result) => result.id === "layer:parks")).toBe(false);
  });

  it("offers the reviewed park-place map for a parks request", () => {
    expect(searchIndex("parks", 8, [])[0]).toMatchObject({
      id: "action:map-parks",
      href: "/map?intent=outdoor&sub=parks",
    });
  });

  it.each(["hiking trail", "playground", "park"])(
    "keeps an actual place within the first two Radius results for %s",
    (query) => {
      const results = qualifiedSearchIndex(query, 8, []).results;
      expect(results.slice(0, 2).some((result) => result.type === "place")).toBe(true);
    },
  );

  it("keeps service and utility problems out of amenity actions", () => {
    expect(searchIndex("trash pickup schedule", 8, []).some((result) => result.href === "/map?amenity=trash")).toBe(false);
    expect(searchIndex("river water levels", 8, []).some((result) => result.href === "/map?amenity=water")).toBe(false);
    expect(searchIndex("power outage", 8, []).some((result) => result.href === "/map?amenity=outlet")).toBe(false);
  });

  it("does not turn short utility nouns into unrelated quick actions", () => {
    const er = qualifiedSearchIndex("ER", 10, []).results;
    const ev = qualifiedSearchIndex("EV", 10, []).results;
    const ups = qualifiedSearchIndex("UPS", 10, []).results;

    expect(er[0]?.href).toBe("/emergency");
    expect(er.slice(0, 10).some((result) => result.href === "/tonight")).toBe(false);
    expect(er.slice(0, 10).some((result) => /erica/i.test(result.title))).toBe(false);
    expect(ev[0]?.href).toBe("/map?amenity=ev");
    expect(ev.slice(0, 10).some((result) => result.href === "/events")).toBe(false);
    expect(ups[0]?.href).toBe("/shipping");
    expect(ups).toHaveLength(1);
  });

  it("routes ATM to live map search without presenting banks as confirmed ATMs", () => {
    const results = qualifiedSearchIndex("ATM", 10, []).results;
    expect(results[0]).toMatchObject({
      id: "action:map-atm",
      href: "/map?q=ATM",
    });
    expect(results.some((result) => result.type === "place")).toBe(false);
  });

  it("routes DMV to the verified state MVA contact without catalog padding", () => {
    expect(findDepartments("DMV", 2)[0]).toMatchObject({
      slug: "state-mva",
      jurisdiction: "state",
    });
    expect(qualifiedSearchIndex("DMV", 10, []).results[0]).toMatchObject({
      type: "action", id: "department:state-mva", badge: "Official resource",
    });
  });

  it("answers Wi-Fi with the live amenity control instead of place-name noise", () => {
    const results = qualifiedSearchIndex("WiFi", 10, []).results;

    expect(results[0]).toMatchObject({
      id: "action:map-wifi",
      href: "/map?amenity=wifi",
    });
    expect(results.some((result) => result.type === "place")).toBe(false);
  });

  it("keeps coffee and Brunswick when Wi-Fi and quiet are requested", () => {
    const { results, meta } = qualifiedSearchIndex("quiet coffee with wifi in Brunswick", 12, [], {
      municipality: "frederick",
      origin: { lng: -77.4105, lat: 39.4143 },
    });
    const places = results.filter((result) => result.type === "place");

    expect(results[0]?.type).toBe("place");
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((result) => result.subtitle.startsWith("Coffee · Brunswick"))).toBe(true);
    expect(places.every((result) => result.subtitle.includes("Not confirmed: Wi-Fi and noise level."))).toBe(true);
    expect(meta.qualifiers).toMatchObject({ categoryKey: "coffee", requestedFeatures: ["wifi", "quiet"] });
    expect(meta.scopeMunicipality).toBe("brunswick");
    expect(results.find((result) => result.id === "action:map-wifi")?.href).toBe("/map?amenity=wifi&in=brunswick");
  });

  it.each([
    ["restaurant with parking in Brunswick", "restaurant", /Not confirmed: parking\./],
    ["park with restrooms in Brunswick", "park", /Not confirmed: restrooms\./],
    ["cafe with power outlets in Brunswick", "coffee", /Not confirmed: power outlets\./],
  ] as const)("keeps the place request ahead of an amenity handoff for %s", (query, role, caveat) => {
    const { results, meta } = qualifiedSearchIndex(query, 12, []);
    const places = results.filter((result) => result.type === "place");
    const catalog = new Map(placeLoader.clientPlaces().map((place) => [`place:${place.slug}`, place]));
    expect(results[0]?.type).toBe("place");
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((result) => {
      const place = catalog.get(result.id)!;
      return place.municipality === "brunswick" && (place.category === role || place.subcategories?.includes(role));
    })).toBe(true);
    expect(places.every((result) => caveat.test(result.subtitle))).toBe(true);
    expect(meta.scopeMunicipality).toBe("brunswick");
  });

  it("prefers structured Wi-Fi evidence over an unknown cafe without inventing quiet", () => {
    const base = placeLoader.clientPlaces().find((place) => place.category === "coffee")!;
    const mock = vi.spyOn(placeLoader, "clientPlaces").mockReturnValue([
      { ...base, slug: "unknown-cafe", name: "Unknown Cafe", municipality: "brunswick", feature_score: 10 },
      { ...base, slug: "wifi-cafe", name: "Wi-Fi Cafe", municipality: "brunswick", feature_score: 1, amenities: ["wifi"] },
    ]);
    try {
      const { results } = qualifiedSearchIndex("quiet coffee with wifi in Brunswick", 12, []);
      expect(results[0]).toMatchObject({ id: "place:wifi-cafe", subtitle: "Coffee · Brunswick · Not confirmed: noise level." });
      expect(results.find((result) => result.id === "place:unknown-cafe")?.subtitle).toContain("Not confirmed: Wi-Fi and noise level.");
    } finally {
      mock.mockRestore();
    }
  });

  it("still leads a scoped standalone utility request with its map layer", () => {
    const { results, meta } = qualifiedSearchIndex("public wifi in Brunswick", 12, []);
    expect(results[0]).toMatchObject({ id: "action:map-wifi", href: "/map?amenity=wifi&in=brunswick" });
    expect(results.some((result) => result.type === "place")).toBe(false);
    expect(meta.qualifiers.requestedFeatures).toEqual([]);
  });

  it("keeps coffee as the destination when a park is only a landmark", () => {
    const { results, meta } = qualifiedSearchIndex("coffee with wifi near Baker Park", 12, []);
    expect(meta.qualifiers).toMatchObject({ categoryKey: "coffee", strictPlaceKind: null, requestedFeatures: ["wifi"] });
    expect(results[0]?.type).toBe("place");
    expect(results.filter((result) => result.type === "place").every((result) => result.badge === "Coffee")).toBe(true);
  });

  it("keeps utility-first Wi-Fi near a library on the scoped utility layer", () => {
    const { results, meta } = qualifiedSearchIndex("public wifi near a library in Brunswick", 12, []);
    expect(results[0]).toMatchObject({ id: "action:map-wifi", href: "/map?amenity=wifi&in=brunswick" });
    expect(results.some((result) => result.type === "place")).toBe(false);
    expect(meta.qualifiers).toMatchObject({ strictPlaceKind: null, requestedFeatures: [] });
  });

  it.each(["cafe without wifi", "park without parking"])("does not offer a negated amenity as an answer to %s", (query) => {
    const { results, meta } = qualifiedSearchIndex(query, 12, []);
    expect(meta.qualifiers.requestedFeatures).toEqual([]);
    expect(results.some((result) => /action:map-(?:wifi|parking)/.test(result.id))).toBe(false);
  });

  it("keeps a known place name from becoming an unsupported noise claim", () => {
    const base = placeLoader.clientPlaces().find((place) => place.category === "coffee")!;
    const mock = vi.spyOn(placeLoader, "clientPlaces").mockReturnValue([
      { ...base, slug: "quiet-cafe", name: "Quiet Cafe", municipality: "brunswick" },
    ]);
    try {
      const { results, meta } = qualifiedSearchIndex("Quiet Cafe with wifi in Brunswick", 12, []);
      expect(meta.qualifiers.requestedFeatures).toEqual(["wifi"]);
      expect(results[0]).toMatchObject({ id: "place:quiet-cafe", subtitle: "Coffee · Brunswick · Not confirmed: Wi-Fi." });
    } finally {
      mock.mockRestore();
    }
  });

  it("retains both features in an affirmative list and keeps a negative list unsupported", () => {
    const positive = qualifiedSearchIndex("coffee with wifi and parking in Brunswick", 12, []);
    expect(positive.meta.qualifiers.requestedFeatures).toEqual(["wifi", "parking"]);
    expect(positive.results[0]?.type).toBe("place");
    expect(positive.results.filter((result) => result.type === "place").every((result) => result.subtitle.includes("Not confirmed: Wi-Fi and parking."))).toBe(true);
    const negative = qualifiedSearchIndex("coffee without wifi and parking in Brunswick", 12, []);
    expect(negative.meta.qualifiers.requestedFeatures).toEqual([]);
    expect(negative.results.some((result) => /action:map-(?:wifi|parking)/.test(result.id))).toBe(false);
  });

  it("does not erase a feature word from a known name when the same feature is requested", () => {
    const base = placeLoader.clientPlaces().find((place) => place.category === "coffee")!;
    const mock = vi.spyOn(placeLoader, "clientPlaces").mockReturnValue([
      { ...base, slug: "wifi-cafe", name: "Wi-Fi Cafe", municipality: "brunswick", feature_score: 1 },
      { ...base, slug: "other-cafe", name: "Other Cafe", municipality: "brunswick", feature_score: 10 },
    ]);
    try {
      const { results, meta } = qualifiedSearchIndex("Wi-Fi Cafe with wifi in Brunswick", 12, []);
      expect(meta.qualifiers.cleanedQuery).toBe("wi-fi cafe in brunswick");
      expect(results[0]).toMatchObject({ id: "place:wifi-cafe", subtitle: "Coffee · Brunswick · Not confirmed: Wi-Fi." });
    } finally {
      mock.mockRestore();
    }
  });

  it("keeps an exact named cafe and its requested Wi-Fi fact", () => {
    const beans = placeLoader.clientPlaces().find((place) => place.name === "Beans in the Belfry")!;
    const { results, meta } = qualifiedSearchIndex("Beans in the Belfry with wifi in Brunswick", 12, [], { municipality: "frederick" });
    expect(results[0]).toMatchObject({ id: `place:${beans.slug}`, subtitle: "Coffee · Brunswick · Not confirmed: Wi-Fi." });
    expect(results.filter((result) => result.type === "place")).toHaveLength(1);
    expect(meta.qualifiers).toMatchObject({ namedPlaceSlug: beans.slug, requestedFeatures: ["wifi"] });
    expect(meta.scopeMunicipality).toBe("brunswick");
    expect(results.find((result) => result.id === "action:map-wifi")?.href).toBe("/map?amenity=wifi&in=brunswick");
  });

  it("preserves a named cafe without presenting a negated feature as confirmed", () => {
    const beans = placeLoader.clientPlaces().find((place) => place.name === "Beans in the Belfry")!;
    const { results, meta } = qualifiedSearchIndex("Beans in the Belfry without wifi in Brunswick", 12, []);
    expect(results[0]?.id).toBe(`place:${beans.slug}`);
    expect(results.filter((result) => result.type === "place")).toHaveLength(1);
    expect(meta.qualifiers).toMatchObject({ namedPlaceSlug: beans.slug, requestedFeatures: [] });
    expect(meta.qualifiers.cleanedQuery).toContain("without wifi");
    expect(results.some((result) => result.id === "action:map-wifi")).toBe(false);
    expect(results[0]?.subtitle).not.toMatch(/(?:without|no) Wi-Fi/i);
  });

  it("does not turn an ancillary named cafe into the exact destination", () => {
    const { results, meta } = qualifiedSearchIndex("coffee with wifi near Beans in the Belfry", 12, [], { municipality: "brunswick" });
    expect(meta.qualifiers).toMatchObject({ namedPlaceSlug: null, categoryKey: "coffee", requestedFeatures: ["wifi"] });
    expect(results[0]?.type).toBe("place");
    expect(results.filter((result) => result.type === "place").length).toBeGreaterThan(1);
  });

  it("recognizes a named-place amenity question without broadening its destination", () => {
    const { results, meta } = qualifiedSearchIndex("Does Beans in the Belfry have Wi-Fi in Brunswick?", 12, []);
    expect(meta.qualifiers).toMatchObject({ namedPlaceSlug: "beans-in-the-belfry-brunswick", requestedFeatures: ["wifi"] });
    expect(results.filter((result) => result.type === "place")).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "place:beans-in-the-belfry-brunswick", subtitle: "Coffee · Brunswick · Not confirmed: Wi-Fi." });
  });

  it.each([
    ["parks with restrooms in Brunswick", "park"],
    ["parks without restrooms in Brunswick", "park"],
    ["park with parking in Brunswick", "park"],
    ["park without parking in Brunswick", "park"],
    ["restaurant with no parking in Brunswick", "restaurant"],
    ["library without wifi in Brunswick", "library"],
  ])("keeps an exact destination role for %s", (query, role) => {
    const { results, meta } = qualifiedSearchIndex(query, 12, []);
    const catalog = new Map(placeLoader.clientPlaces().map((place) => [`place:${place.slug}`, place]));
    const places = results.filter((result) => result.type === "place");
    expect(meta.qualifiers.strictPlaceKind).toBe(role);
    if (role !== "library") expect(places.length).toBeGreaterThan(0);
    expect(places.every((result) => {
      const place = catalog.get(result.id)!;
      return place.municipality === "brunswick" && (place.category === role || place.subcategories?.includes(role));
    })).toBe(true);
    if (/without|no parking/.test(query)) {
      expect(meta.qualifiers.requestedFeatures).toEqual([]);
      expect(results.some((result) => /action:map-(?:wifi|parking|restroom)/.test(result.id))).toBe(false);
      expect(places.every((result) => result.subtitle.includes("Not confirmed: absence of"))).toBe(true);
    }
  });

  it("excludes contrary amenity evidence while keeping missing negative evidence explicit", () => {
    const base = placeLoader.clientPlaces().find((place) => place.category === "coffee")!;
    const loader = vi.spyOn(placeLoader, "clientPlaces").mockReturnValue([
      { ...base, slug: "known-wifi", name: "Connected Cafe", municipality: "brunswick", amenities: ["wifi"] },
      { ...base, slug: "unknown-wifi", name: "Another Cafe", municipality: "brunswick", amenities: [] },
    ]);
    try {
      const { results } = qualifiedSearchIndex("coffee without wifi in Brunswick", 12, []);
      const places = results.filter((result) => result.type === "place");
      expect(places).toHaveLength(1);
      expect(places[0]).toMatchObject({ id: "place:unknown-wifi", subtitle: "Coffee · Brunswick · Not confirmed: absence of Wi-Fi." });
      expect(results.some((result) => result.id === "action:map-wifi")).toBe(false);
    } finally {
      loader.mockRestore();
    }
  });

  it.each(["and", "or"])("excludes both negated amenities around %s with a modifier", (conjunction) => {
    const base = placeLoader.clientPlaces().find((place) => place.category === "coffee")!;
    const loader = vi.spyOn(placeLoader, "clientPlaces").mockReturnValue([
      { ...base, slug: "known-wifi", name: "Connected Cafe", municipality: "brunswick", amenities: ["wifi"] },
      { ...base, slug: "known-parking", name: "Parking Cafe", municipality: "brunswick", amenities: ["free-parking"] },
      { ...base, slug: "unknown-amenities", name: "Another Cafe", municipality: "brunswick", amenities: [] },
    ]);
    try {
      const { results, meta } = qualifiedSearchIndex(`coffee without wifi ${conjunction} free parking in Brunswick`, 12, []);
      expect(meta.qualifiers.requestedFeatures).toEqual([]);
      expect(meta.qualifiers.negatedFeatures).toEqual(["wifi", "parking"]);
      expect(results.filter((result) => result.type === "place")).toEqual([
        expect.objectContaining({ id: "place:unknown-amenities", subtitle: "Coffee · Brunswick · Not confirmed: absence of Wi-Fi and parking." }),
      ]);
      expect(results.some((result) => /action:map-(?:wifi|parking)/.test(result.id))).toBe(false);
    } finally {
      loader.mockRestore();
    }
  });

  it.each([
    ["coffee without wheelchair access in Brunswick", ""],
    ["coffee without wheelchair access and wifi in Brunswick", " · Not confirmed: absence of Wi-Fi."],
  ])("separates recorded accessibility exclusions from unknown absence for %s", (query, knownCaveat) => {
    const base = placeLoader.clientPlaces().find((place) => place.category === "coffee")!;
    const loader = vi.spyOn(placeLoader, "clientPlaces").mockReturnValue([
      { ...base, slug: "access-present", name: "Access Cafe", municipality: "brunswick", amenities: [], accessibility: { wheelchair: true } },
      { ...base, slug: "access-absent", name: "Barrier Cafe", municipality: "brunswick", amenities: [], accessibility: { wheelchair: false } },
      { ...base, slug: "access-unknown", name: "Unknown Cafe", municipality: "brunswick", amenities: [], accessibility: undefined },
    ]);
    try {
      const places = qualifiedSearchIndex(query, 12, []).results.filter((result) => result.type === "place");
      expect(places).toHaveLength(2);
      expect(places.find((place) => place.id === "place:access-present")).toBeUndefined();
      expect(places.find((place) => place.id === "place:access-absent")?.subtitle).toBe(`Coffee · Brunswick${knownCaveat}`);
      expect(places.find((place) => place.id === "place:access-unknown")?.subtitle).toContain("wheelchair access.");
    } finally {
      loader.mockRestore();
    }
  });

  it("does not load places for event/page-only queries and computes live status once for place lookups", () => {
    const loader = vi.spyOn(placeLoader, "clientPlaces");
    try {
      qualifiedSearchIndex("events tonight", 8, [], { resultKind: "event" });
      qualifiedSearchIndex("settings", 8, [], { resultKind: "page" });
      qualifiedSearchIndex("events with wifi tonight", 8, []);
      expect(loader).not.toHaveBeenCalled();
      qualifiedSearchIndex("coffee", 8, []);
      expect(loader).toHaveBeenCalledTimes(1);
      loader.mockClear();
      qualifiedSearchIndex("Does Beans in the Belfry have wifi?", 8, []);
      expect(loader).toHaveBeenCalledTimes(1);
    } finally {
      loader.mockRestore();
    }
  });

  it("keeps an explicit planning request on the tonight planner", () => {
    expect(searchIndex("plan tonight", 8, [])[0]).toMatchObject({
      id: "action:tonight",
      href: "/tonight",
    });
  });

  it.each([
    ["public restroom near me", /restroom|bathroom|toilet/i],
    ["trash can near me", /trash|garbage|waste/i],
    ["dog waste bags near me", /dog|pet|waste/i],
    ["EV charging near me", /\bev\b|electric|charg/i],
    ["playgrounds near me", /playground|park|recreation/i],
    ["urgent care near me", /urgent|medical|hospital|clinic|walk-in/i],
  ])("does not proximity-fill %s with unrelated businesses", (query, evidence) => {
    const results = qualifiedSearchIndex(query, 8, [], {
      origin: { lng: -77.4105, lat: 39.4143 },
      municipality: "frederick",
      contextLabel: "your location",
      canShowDistance: true,
    }).results;
    const places = results.filter((result) => result.type === "place");

    expect(
      places.every((result) =>
        evidence.test(
          `${result.title} ${result.subtitle} ${result.badge ?? ""}`,
        ),
      ),
    ).toBe(true);
  });
});

describe("official services share the Find doorway", () => {
  it.each(["report a pothole", "marriage license", "register to vote", "water bill"])(
    "gives %s the same authoritative answer in both adapters", (query) => {
      const direct = searchIndex(query, 8, []);
      const qualified = qualifiedSearchIndex(query, 8, []).results;
      expect(qualified).toEqual(direct);
      expect(qualified[0]?.id).toMatch(/^civic:/);
      expect(qualified.every((result) => result.type === "action")).toBe(true);
      expect(qualified[0]?.href).toMatch(/^https:\/\//);
    },
  );

  it.each(["dog friendly restaurant", "water park", "health food", "bus station"])(
    "does not invent government intent in %s", (query) => {
      const results = qualifiedSearchIndex(query, 12, []).results;
      expect(results.some((result) => /^(?:civic|department):/.test(result.id))).toBe(false);
    },
  );
});

describe("dated result handoffs", () => {
  it("carries Brunswick and tonight into both map and calendar actions", () => {
    const results = qualifiedSearchIndex("events in Brunswick tonight", 8, [], {
      now: new Date("2026-09-06T16:00:00Z"),
    }).results;
    expect(results.some((result) => result.type === "place" || result.type === "category")).toBe(false);
    expect(results.find((result) => result.id === "action:map-tonight")?.href).toBe("/map?t=tonight&in=brunswick");
    expect(results.find((result) => result.id === "action:events")?.href).toBe("/events?in=brunswick&d=2026-09-06&tod=evening");
  });

  it("never passes next weekend into this weekend's map control", () => {
    const results = qualifiedSearchIndex("events next weekend", 8, []).results;
    expect(results.some((result) => result.type === "place")).toBe(false);
    expect(results.some((result) => result.href.includes("t=weekend") || result.href.includes("when=weekend"))).toBe(false);
    expect(results.find((result) => result.id === "action:events")?.subtitle).toContain("next weekend");
  });
});
