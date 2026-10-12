import { describe, expect, it } from "vitest";
import {
  activeMapTask,
  applyMapIntentToParams,
  applyMapTaskToParams,
  buildMapTaskList,
  isMapCommandResult,
  mapQueryRoute,
  parseMapClientTask,
  placesForMapClientTask,
  rankMapTaskPlaces,
  type MapTaskListInput,
} from "./mapListTask";
import type { EventPin, MapPinPlace } from "./types";
import type { SearchResult } from "@/lib/search/index";

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
  ])("sends %s to the likely-open set", (query) => {
    expect(mapQueryRoute(query)).toEqual({ kind: "task", task: "likely-open" });
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
    expect(list?.title).toBe("Coffee · This area");
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
