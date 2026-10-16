import { describe, expect, it } from "vitest";
import {
  activeMapTask,
  parseMapTaskArea,
  mapTaskAreaParam,
  mapPointInTaskArea,
  applyMapIntentToParams,
  applyMapTaskToParams,
  buildMapTaskList,
  isMapCommandResult,
  eventInMapScope,
  mapQueryRoute,
  mapQueryAllowsTemporaryFallback,
  mapRankedSearchHref,
  parseMapClientTask,
  placesForMapClientTask,
  rankMapTaskPlaces,
  type MapTaskListInput,
} from "./mapListTask";
import type { EventPin, MapPinPlace } from "./types";
import type { SearchResult } from "@/lib/search/index";
import { buildCuratedGeoJson, buildEventsGeoJson } from "./mapGeoJsonSources";

function place(
  slug: string,
  overrides: Partial<MapPinPlace> = {},
): MapPinPlace {
  return {
    slug,
    name: slug,
    category: "restaurant",
    subcategories: [],
    geom: { lng: -77.41, lat: 39.414 },
    open_status: { state: "unknown" },
    source: "manual",
    is_verified: false,
    municipality: "frederick",
    short_blurb: "",
    ...overrides,
  } as MapPinPlace;
}

function event(slug: string, startsAt: string, overrides: Partial<EventPin> = {}): EventPin {
  return {
    slug,
    title: slug,
    starts_at: startsAt,
    venue_name: "Test venue",
    lng: -77.41,
    lat: 39.414,
    category: "community",
    ...overrides,
  };
}

function bySlug(places: MapPinPlace[]) {
  return new Map(places.map((candidate) => [candidate.slug, candidate]));
}

function input(overrides: Partial<MapTaskListInput>): MapTaskListInput {
  const places = overrides.places ?? [];
  return {
    scope: "county",
    userLoc: null,
    area: null,
    now: new Date("2026-10-07T14:00:00Z"),
    query: null,
    clientTask: null,
    placeFilterLabel: null,
    places,
    placesBySlug: bySlug([...places]),
    eventListLabel: null,
    events: [],
    ...overrides,
  };
}

describe("mapQueryRoute", () => {
  it.each([
    "open now",
    "Open late",
    "what's open",
    "still open",
    "places open right now",
    "open",
  ])("preserves %s in the qualified search", (query) => {
    expect(mapQueryRoute(query)).toEqual({ kind: "search" });
  });

  it.each(["tonight", "events tonight", "What's on tonight?", "things to do tonight"])(
    "sends %s to the tonight event window",
    (query) => {
      expect(mapQueryRoute(query)).toEqual({ kind: "task", task: "events-tonight" });
    },
  );

  it("keeps compound and unrelated phrases as a ranked search", () => {
    for (const query of [
      "open mic tonight",
      "coffee open now",
      "plan tonight",
      "dinner tonight",
      "open air market",
      "dublin roasters",
    ]) {
      expect(mapQueryRoute(query)).toEqual({ kind: "search" });
    }
  });

  it("turns an exact category name into the same task as its tile", () => {
    expect(mapQueryRoute("coffee")).toEqual({ kind: "task", task: "coffee" });
    expect(mapQueryRoute("Eat & drink")).toEqual({ kind: "task", task: "eat" });
    expect(mapQueryRoute("drinks")).toEqual({ kind: "task", task: "drinks" });
    expect(mapQueryRoute("parks and trails")).toEqual({ kind: "task", task: "parks-trails" });
    expect(mapQueryRoute("brewery")).toEqual({ kind: "intent", intentKey: "breweries" });
    expect(mapQueryRoute("pizza")).toEqual({ kind: "intent", intentKey: "eat", subKey: "pizza" });
  });
});

describe("map task URL state", () => {
  it("replaces every other task and keeps the header scope", () => {
    const params = new URLSearchParams(
      "in=brunswick&intent=eat&sub=pizza&open=now&t=weekend&music=tonight&q=tacos&task=drinks&c=1,2,3",
    );
    applyMapTaskToParams(params, "coffee");
    expect(params.toString()).toBe("in=brunswick&c=1%2C2%2C3&intent=coffee");

    applyMapTaskToParams(params, "events-tonight");
    expect(params.get("t")).toBe("tonight");
    expect(params.has("intent")).toBe(false);

    applyMapTaskToParams(params, "likely-open");
    expect(params.get("task")).toBe("likely-open");
    expect(params.has("t")).toBe(false);

    applyMapIntentToParams(params, "eat", "pizza");
    expect(params.get("intent")).toBe("eat");
    expect(params.get("sub")).toBe("pizza");
    expect(params.has("task")).toBe(false);
    expect(params.get("in")).toBe("brunswick");
  });

  it("parses only known client tasks", () => {
    expect(parseMapClientTask("drinks")).toBe("drinks");
    expect(parseMapClientTask("coffee")).toBeNull();
    expect(parseMapClientTask("<script>")).toBeNull();
  });

  it("lights the tile that matches the active view", () => {
    expect(activeMapTask({ clientTask: "drinks", intentKey: "eat" })).toBe("drinks");
    expect(activeMapTask({ clientTask: null, intentKey: "coffee" })).toBe("coffee");
    expect(activeMapTask({ clientTask: null, intentKey: "coffee", subKey: "roasters" })).toBeNull();
    expect(
      activeMapTask({ clientTask: null, timeModeExplicit: true, timeMode: "tonight" }),
    ).toBe("events-tonight");
    expect(
      activeMapTask({
        clientTask: null,
        timeModeExplicit: true,
        timeMode: "tonight",
        musicTonight: true,
      }),
    ).toBeNull();
  });

  it("lets map commands answer Enter by themselves", () => {
    const command = (id: string, type: SearchResult["type"]): SearchResult => ({
      id,
      type,
      title: id,
      subtitle: "",
      href: "/map",
    });
    expect(isMapCommandResult(command("municipality:brunswick", "municipality"))).toBe(true);
    expect(isMapCommandResult(command("action:map-restroom", "action"))).toBe(true);
    expect(isMapCommandResult(command("place:dublin", "place"))).toBe(false);
    expect(isMapCommandResult(undefined)).toBe(false);
  });
});

describe("map client tasks", () => {
  const catalog = [
    place("bar", { category: "bar" }),
    place("brewery", { category: "brewery" }),
    place("park", { category: "park" }),
    place("trail", { category: "trail" }),
    place("diner", { category: "restaurant" }),
    place("dublin-roasters-frederick", { category: "coffee" }),
    place("verified-open", {
      category: "restaurant",
      open_status: { state: "open", closesAt: "22:00", closingSoon: false },
    }),
  ];

  it("draws Drinks and Parks & trails from the existing catalog matchers", () => {
    const now = new Date("2026-10-07T14:00:00Z");
    expect(placesForMapClientTask(catalog, "drinks", now).map((p) => p.slug)).toEqual([
      "bar",
      "brewery",
    ]);
    expect(placesForMapClientTask(catalog, "parks-trails", now).map((p) => p.slug)).toEqual([
      "park",
      "trail",
    ]);
  });

  it("uses /open-now's likely-open rule at the current Frederick minute", () => {
    // 10:00 AM Eastern: inside Dublin Roasters' curated 7-6 window.
    const morning = new Date("2026-10-07T14:00:00Z");
    expect(placesForMapClientTask(catalog, "likely-open", morning).map((p) => p.slug)).toEqual([
      "dublin-roasters-frederick",
      "verified-open",
    ]);
    // 11:00 PM Eastern: the curated window is closed; a confirmed open stays.
    const late = new Date("2026-10-08T03:00:00Z");
    expect(placesForMapClientTask(catalog, "likely-open", late).map((p) => p.slug)).toEqual([
      "verified-open",
    ]);
  });
});

describe("rankMapTaskPlaces", () => {
  it("never measures from the map center: without a fix, places that can say something lead", () => {
    const rows = rankMapTaskPlaces(
      [
        place("plain"),
        place("described", { short_blurb: "A downtown coffeehouse." }),
        place("open", { open_status: { state: "open", closesAt: "22:00", closingSoon: false } }),
      ],
      null,
    );
    expect(rows.map((row) => row.slug)).toEqual(["open", "described", "plain"]);
  });

  it("leads with the nearest place once there is a real location fix", () => {
    const rows = rankMapTaskPlaces(
      [
        place("far", { geom: { lng: -77.7, lat: 39.4 } }),
        place("near", { geom: { lng: -77.41, lat: 39.414 } }),
      ],
      { lng: -77.41, lat: 39.414 },
    );
    expect(rows.map((row) => row.slug)).toEqual(["near", "far"]);
  });
});

describe("buildMapTaskList", () => {
  it("stays silent at rest", () => {
    expect(buildMapTaskList(input({}))).toBeNull();
  });

  it("ranks a submitted query from its local place results, within the header scope", () => {
    const frederick = place("frederick-coffee", { category: "coffee" });
    const brunswick = place("beans-in-the-belfry", {
      category: "coffee",
      municipality: "brunswick",
    });
    const results: SearchResult[] = [
      { type: "category", id: "category:coffee", title: "Coffee", subtitle: "", href: "/category/coffee" },
      { type: "place", id: "place:beans-in-the-belfry", title: "Beans", subtitle: "", href: "#" },
      { type: "place", id: "place:frederick-coffee", title: "FCC", subtitle: "", href: "#" },
      { type: "place", id: "mapbox:1", title: "Temp", subtitle: "", href: "#", temporary: true },
    ];
    const list = buildMapTaskList(
      input({
        places: [frederick, brunswick],
        scope: "town:brunswick",
        query: { text: "coffee shops", results, pending: false },
      }),
    );
    expect(list?.title).toBe("“coffee shops” · Brunswick");
    expect(list?.rows.map((row) => row.kind === "place" && row.place.slug)).toEqual([
      "beans-in-the-belfry",
    ]);
    expect(list?.note).toBe("Hours for these places are not confirmed, so check before you go.");
    expect(list?.askQuery).toBe("coffee shops");
  });

  it("is honest while a submitted query is still searching and when it finds nothing", () => {
    const pending = buildMapTaskList(
      input({ query: { text: "tacos", results: [], pending: true } }),
    );
    expect(pending?.pending).toBe(true);
    const empty = buildMapTaskList(
      input({ query: { text: "tacos", results: [], pending: false } }),
    );
    expect(empty?.pending).toBe(false);
    expect(empty?.empty.title).toBe("Nothing on this map matches “tacos.”");
  });

  it("labels the likely-open list with /open-now's wording", () => {
    const list = buildMapTaskList(
      input({
        clientTask: "likely-open",
        places: [place("dublin-roasters-frederick", { category: "coffee" })],
      }),
    );
    expect(list?.title).toBe("Likely open now · Whole county");
    expect(list?.note).toBe(
      "These places are usually open at this hour based on their posted schedules. Check before you go.",
    );
    expect(list?.rows).toHaveLength(1);
  });

  it("re-runs a task inside the searched area only", () => {
    const inside = place("inside", { geom: { lng: -77.41, lat: 39.414 } });
    const outside = place("outside", { geom: { lng: -77.7, lat: 39.3 } });
    const list = buildMapTaskList(
      input({
        placeFilterLabel: "Coffee",
        places: [inside, outside],
        area: { west: -77.5, east: -77.3, south: 39.35, north: 39.5 },
      }),
    );
    expect(list?.title).toBe("Coffee shops and bakeries · This area");
    expect(list?.rows.map((row) => row.kind === "place" && row.place.slug)).toEqual(["inside"]);
    const nothing = buildMapTaskList(
      input({
        placeFilterLabel: "Coffee",
        places: [outside],
        area: { west: -77.5, east: -77.3, south: 39.35, north: 39.5 },
      }),
    );
    expect(nothing?.empty.title).toBe("Nothing matches in this part of the map.");
  });

  it("orders an event window by start time", () => {
    const list = buildMapTaskList(
      input({
        eventListLabel: "Events tonight",
        events: [
          event("late", "2026-10-07T23:30:00Z"),
          event("early", "2026-10-07T22:00:00Z"),
        ],
      }),
    );
    expect(list?.unit).toBe("event");
    expect(list?.title).toBe("Events tonight · Whole county");
    expect(list?.rows.map((row) => row.kind === "event" && row.event.slug)).toEqual([
      "early",
      "late",
    ]);
  });
});


describe("map request constraints and source truth", () => {
  it.each(["open now near me", "open late", "coffee open now", "coffee in Brunswick", "events tonight in Thurmont"])("keeps every constraint in %s", (query) => {
    expect(mapQueryRoute(query)).toEqual({ kind: "search" });
  });

  it("routes only the explicitly qualified availability name to a posted-hours estimate", () => {
    expect(mapQueryRoute("likely open now")).toEqual({ kind: "task", task: "likely-open" });
  });

  it("does not use a camera or town centroid as the reader's location", () => {
    const candidate = place("unlocated-open", { open_status: { state: "open", closesAt: "22:00", closingSoon: false } });
    const list = buildMapTaskList(input({ scope: "nearme", places: [candidate], query: {
      text: "open now near me", pending: true, unavailable: true, results: [{ type: "place", id: `place:${candidate.slug}`, title: candidate.name, subtitle: "Open now", href: "/places/unlocated-open" }],
    } }));
    expect(list?.rows).toEqual([]);
    expect(list?.locationRequired).toBe(true);
    expect(list?.unavailable).toBe(false);
    expect(list?.pending).toBe(false);
    expect(list?.scope).toBe("county");
    expect(list?.title).toContain("Whole county");
    expect(list?.empty.copy).toContain("Share your location from the header");
    expect(list?.askQuery).toBeNull();
  });

  it("retains real near-me candidates only within the same one-mile scope as pins", () => {
    const near = place("near");
    const far = place("far", { geom: { lng: -77.7, lat: 39.3 } });
    const list = buildMapTaskList(input({ scope: "nearme", userLoc: near.geom, places: [far, near], placeFilterLabel: "Coffee" }));
    expect(list?.rows.map((row) => row.kind === "place" && row.place.slug)).toEqual(["near"]);
  });

  it("requires a canonical event town or a known venue, never centroid proximity", () => {
    const unknownTown = event("unknown-town", "2026-10-07T22:00:00Z");
    expect(eventInMapScope(unknownTown, "town:frederick", null, new Map())).toBe(false);
    expect(eventInMapScope({ ...unknownTown, municipality: "frederick" }, "town:frederick", null, new Map())).toBe(true);
    const venue = place("known-venue");
    expect(eventInMapScope({ ...unknownTown, venue_place_slug: venue.slug }, "town:frederick", null, bySlug([venue]))).toBe(true);
  });

  it("does not let unconfirmed or closed hours become a successful likely-open answer", () => {
    const list = buildMapTaskList(input({ clientTask: "likely-open", places: [place("unknown"), place("closed", { open_status: { state: "closed" } })] }));
    expect(list?.rows).toEqual([]);
    expect(list?.empty.title).toContain("Unable to confirm");
    expect(list?.empty.copy).toContain("does not mean every place is closed");
  });

  it("keeps search failures and incomplete event sources distinct from genuine zero results", () => {
    const failed = buildMapTaskList(input({ query: { text: "tacos", results: [], pending: false, unavailable: true } }));
    expect(failed?.unavailable).toBe(true);
    const pending = buildMapTaskList(input({ eventListLabel: "Events tonight", eventSourceState: "pending" }));
    expect(pending?.pending).toBe(true);
    const unavailable = buildMapTaskList(input({ eventListLabel: "Events tonight", eventSourceState: "unavailable" }));
    expect(unavailable?.unavailable).toBe(true);
    const partial = buildMapTaskList(input({ eventListLabel: "Events tonight", eventSourceState: "partial" }));
    expect(partial?.note).toContain("could not be updated");
  });

  it("keeps qualified search evidence attached to the ranked row", () => {
    const candidate = place("cafe");
    const list = buildMapTaskList(input({ places: [candidate], query: { text: "coffee with Wi-Fi", pending: false, results: [{ type: "place", id: "place:cafe", title: "Cafe", subtitle: "Wi-Fi not confirmed", href: "/places/cafe" }] } }));
    expect(list?.rows[0]).toMatchObject({ searchSubtitle: "Wi-Fi not confirmed" });
  });
});


it("retains a deliberately searched area's exact bounds only for its header scope", () => {
  const bounds = { west: -77.51, south: 39.32, east: -77.4, north: 39.49 };
  const encoded = mapTaskAreaParam(bounds, "town:brunswick");
  expect(parseMapTaskArea(encoded, "town:brunswick")).toEqual(bounds);
  expect(parseMapTaskArea(encoded, "town:thurmont")).toBeNull();
  for (const invalid of ["brunswick,0,0,0,0", "brunswick,NaN,1,2,3", "brunswick,181,1,200,3", "brunswick,,1,2,3"]) expect(parseMapTaskArea(invalid, "town:brunswick")).toBeNull();
  const params = new URLSearchParams({ in: "brunswick", area: encoded, layers: "parks", c: "-77.4,39.4,12" });
  applyMapTaskToParams(params, "coffee");
  expect(params.has("area")).toBe(false);
  expect(params.get("in")).toBe("brunswick");
  expect(params.get("c")).toBe("-77.4,39.4,12");
  expect(params.get("layers")).toBe("parks");
});


describe("canonical ranked query evidence", () => {
  const facts = { starts_at: "2026-10-07T22:00:00Z", ends_at: "2026-10-08T00:00:00Z", venue_name: "Actual venue", municipality: "frederick", source_label: "Actual publisher", point: { lng: -77.41, lat: 39.414 } };
  function hit(slug: string, fresh = true): SearchResult {
    return { type: "event", id: `event:${slug}`, title: slug, subtitle: "Actual venue · Oct 7", href: `/events/${slug}`, ...(fresh ? { event: facts } : {}) };
  }
  it("preserves authoritative mixed place, loaded-event and direct-event order", () => {
    const cafe = place("cafe");
    const loaded = event("loaded", facts.starts_at, { municipality: "frederick" });
    const rows = buildMapTaskList(input({ places: [cafe], events: [loaded], query: { text: "community cafe tonight", pending: false, results: [hit("outside-window"), { type: "place", id: "place:cafe", title: "cafe", subtitle: "Wi-Fi not confirmed", href: "/places/cafe" }, hit("loaded"), hit("outside-window")] } }))!;
    expect(rows.unit).toBe("result");
    expect(rows.rows.map(row => row.kind)).toEqual(["event-link", "place", "event"]);
    expect(rows.rows[1]).toMatchObject({ searchSubtitle: "Wi-Fi not confirmed" });
    expect(rows.rows[0]).toMatchObject({ result: { event: facts } });
  });
  it("shows event-only hits instead of claiming nothing matched", () => {
    const list = buildMapTaskList(input({ query: { text: "open mic tonight", pending: false, results: [hit("real-show")] } }))!;
    expect(list).toMatchObject({ unit: "event", pending: false, unavailable: false });
    expect(list.rows).toEqual([{ kind: "event-link", result: hit("real-show") }]);
  });
  it("retains legacy canonical links in county without inventing dates or pins", () => {
    const legacy = hit("legacy-show", false);
    expect(buildMapTaskList(input({ query: { text: "show", results: [legacy], pending: false } }))!.rows).toEqual([{ kind: "event-link", result: legacy }]);
    expect(buildMapTaskList(input({ scope: "town:frederick", query: { text: "show", results: [legacy], pending: false } }))!.rows).toEqual([]);
    expect(buildMapTaskList(input({ area: { west: -77.42, east: -77.40, south: 39.40, north: 39.42 }, query: { text: "show", results: [legacy], pending: false } }))!.rows).toEqual([]);
  });
  it("uses fresh actual town and coordinates to qualify event links", () => {
    const query = { text: "show", results: [hit("show")], pending: false };
    expect(buildMapTaskList(input({ scope: "town:frederick", query }))!.rows).toHaveLength(1);
    expect(buildMapTaskList(input({ scope: "town:brunswick", query }))!.rows).toHaveLength(0);
    expect(buildMapTaskList(input({ scope: "nearme", userLoc: { lng: -77.63, lat: 39.31 }, query }))!.rows).toHaveLength(0);
  });
  it("never uses external or malformed event destinations as canonical matches", () => {
    expect(buildMapTaskList(input({ query: { text: "show", pending: false, results: [{ ...hit("show"), href: "https://example.test/events/show" }] } }))!.rows).toEqual([]);
  });
  it.each(["open now near me", "open late", "coffee open now", "coffee in Brunswick", "open mic tonight", "restaurants with Wi-Fi"])("keeps %s out of generic temporary-provider suggestions", query => {
    expect(mapQueryAllowsTemporaryFallback(query, "county")).toBe(false);
  });
  it("still permits a plain unknown destination only in county scope", () => {
    expect(mapQueryAllowsTemporaryFallback("unlisted destination", "county")).toBe(true);
    expect(mapQueryAllowsTemporaryFallback("unlisted destination", "town:brunswick")).toBe(false);
  });
  it("preserves exact scope, query, committed area and camera in the full-search handoff", () => {
    const origin = "/map?q=no-match&in=brunswick&area=brunswick,-77.64,39.30,-77.61,39.33&c=-77.63,39.31,14&layers=parks";
    const href = new URL(mapRankedSearchHref("no-match", "town:brunswick", origin), "https://example.test");
    expect(href.searchParams.get("q")).toBe("no-match");
    expect(href.searchParams.get("in")).toBe("brunswick");
    expect(href.searchParams.get("returnTo")).toBe(origin);
  });
});


describe("committed task area and documented coffee ranking", () => {
  it("keeps actual place and event pin sources aligned with the same bounded ranked answer", () => {
    const area = { west: -77.42, east: -77.40, south: 39.40, north: 39.42 };
    const inside = place("inside");
    const edge = place("edge", { geom: { lng: area.east, lat: area.north } });
    const outside = place("outside", { geom: { lng: -77.63, lat: 39.31 } });
    const shownEvent = event("inside-event", "2026-10-12T22:00:00Z");
    const outsideEvent = event("outside-event", "2026-10-12T22:00:00Z", { lng: -77.63, lat: 39.31 });
    const places = [outside, inside, edge];
    const events = [outsideEvent, shownEvent];
    const query = { text: "community", pending: false, results: [
      ...places.map(p => ({ type: "place" as const, id: `place:${p.slug}`, title: p.name, subtitle: "", href: `/places/${p.slug}` })),
      ...events.map(e => ({ type: "event" as const, id: `event:${e.slug}`, title: e.title, subtitle: "", href: `/events/${e.slug}` })),
    ] };
    const rows = buildMapTaskList(input({ places, events, query, area }))!.rows;
    const placeSource = buildCuratedGeoJson(places.filter(p => mapPointInTaskArea(p.geom, area)), { amenitiesActive: false, visualMatchSet: null, searchPlaceSet: null });
    const eventSource = buildEventsGeoJson(events.filter(e => mapPointInTaskArea(e, area)));
    expect(placeSource.features.map(f => f.properties.slug)).toEqual(["inside", "edge"]);
    expect(rows.filter(r => r.kind === "place").map(r => r.place.slug)).toEqual(placeSource.features.map(f => f.properties.slug));
    expect(eventSource.features.map(f => f.properties.id)).toEqual(["inside-event"]);
    expect(rows.filter(r => r.kind === "event").map(r => r.event.slug)).toEqual(eventSource.features.map(f => f.properties.id));
    expect(mapPointInTaskArea({ lng: NaN, lat: 39.41 }, area)).toBe(false);
  });

  it("restores a prior URL area and resets it for a changed task without retaining a prior selection's bounds", () => {
    const near = place("near");
    const far = place("far", { geom: { lng: -77.63, lat: 39.31 } });
    const prior = new URLSearchParams({ in: "county", intent: "coffee", area: "county,-77.42,39.40,-77.40,39.42", layers: "parks" });
    const next = new URLSearchParams(prior);
    next.set("area", "county,-77.64,39.30,-77.62,39.32");
    const rowsFor = (params: URLSearchParams) => buildMapTaskList(input({ places: [near, far], placeFilterLabel: "Coffee", area: parseMapTaskArea(params.get("area"), "county") }))!.rows.flatMap(r => r.kind === "place" ? [r.place.slug] : []);
    expect(rowsFor(next)).toEqual(["far"]);
    expect(rowsFor(prior)).toEqual(["near"]);
    applyMapTaskToParams(next, "coffee");
    expect(rowsFor(next)).toEqual(["near", "far"]);
    expect(next.get("layers")).toBe("parks");
  });

  it("labels the broad coffee scope and leads with documented coffee even when a bakery is richer or nearer", () => {
    const bakery = place("bakery", { category: "bakery", short_blurb: "Rich bakery description.", field_notes: true, is_verified: true, feature_score: 10 });
    const coffee = place("coffee", { category: "coffee", geom: { lng: -77.43, lat: 39.42 } });
    for (const userLoc of [null, bakery.geom]) {
      const list = buildMapTaskList(input({ places: [bakery, coffee], placeFilterLabel: "Coffee", userLoc }))!;
      expect(list.title).toBe("Coffee shops and bakeries · Whole county");
      expect(list.rows.flatMap(r => r.kind === "place" ? [r.place.slug] : [])).toEqual(["coffee", "bakery"]);
      expect(list.note).toContain("not confirmed");
    }
    const query = { text: "coffee shops", pending: false, results: [bakery, coffee].map(p => ({ type: "place" as const, id: `place:${p.slug}`, title: p.name, subtitle: "", href: `/places/${p.slug}` })) };
    expect(buildMapTaskList(input({ places: [bakery, coffee], query }))!.rows.flatMap(r => r.kind === "place" ? [r.place.slug] : [])).toEqual(["bakery", "coffee"]);
  });
});
