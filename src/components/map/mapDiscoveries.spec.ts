import { describe, expect, it } from "vitest";
import type { Amenity } from "@/lib/loaders/amenities";
import type { ParkingPin } from "@/lib/map/parking";
import type { EventPin, MapPinPlace } from "./types";
import { buildMapDiscoveries, type BuildMapDiscoveriesInput } from "./mapDiscoveries";

const origin = { lng: -77.4105, lat: 39.4143 };

function place(over: Partial<MapPinPlace> & Pick<MapPinPlace, "slug" | "name" | "category">): MapPinPlace {
  const { slug, name, category, ...rest } = over;
  return {
    slug,
    name,
    category,
    subcategories: [],
    geom: origin,
    open_status: { state: "unknown" },
    is_verified: true,
    field_notes: false,
    deal_hook: undefined,
    source: "manual",
    municipality: "frederick",
    short_blurb: "",
    primary_type: category,
    ...rest,
  };
}

function input(over: Partial<BuildMapDiscoveriesInput> = {}): BuildMapDiscoveriesInput {
  return {
    places: [],
    events: [],
    amenities: [],
    parking: [],
    transitStops: [],
    cemeteries: [],
    aerialPhotos: [],
    origin,
    now: new Date("2026-07-22T16:00:00.000Z"),
    ...over,
  };
}

describe("buildMapDiscoveries", () => {
  it("turns an event, nearby food, and parking into one explained connection", () => {
    const event: EventPin = {
      slug: "alive-at-five",
      title: "Alive @ Five",
      starts_at: "2026-07-22T21:00:00.000Z",
      venue_name: "Carroll Creek Amphitheater",
      lng: -77.4110,
      lat: 39.4138,
      category: "music",
    };
    const restaurant = place({
      slug: "the-ordinary-hen",
      name: "The Ordinary Hen",
      category: "restaurant",
      geom: { lng: -77.4104, lat: 39.4140 },
    });
    const garage: ParkingPin = {
      slug: "carroll-creek",
      name: "Carroll Creek Garage",
      address: "44 East Patrick Street",
      lng: -77.4098,
      lat: 39.4142,
      available: 120,
      percentFull: 50,
      isFull: false,
      isFilling: false,
      updated: "2026-07-22T15:58:00.000Z",
    };

    const result = buildMapDiscoveries(input({ places: [restaurant], events: [event], parking: [garage] }));
    const finding = result.find((item) => item.kind === "event-orbit");
    expect(finding?.title).toBe("Before Alive @ Five");
    expect(finding?.summary).toContain("The Ordinary Hen");
    expect(finding?.summary).toContain("Carroll Creek Garage");
    expect(finding?.summary).toContain("begins Wednesday at 5:00 PM");
    expect(finding?.points.map((point) => point.kind)).toEqual(["event", "place", "parking"]);
    expect(finding?.layers.parking).toBe(true);
    expect(finding?.layers.transit).toBeUndefined();
    expect(finding?.evidence).toHaveLength(3);
  });

  it("does not enable a nearby feed that is not part of the finding", () => {
    const event: EventPin = {
      slug: "garage-wins",
      title: "Creek concert",
      starts_at: "2026-07-22T21:00:00.000Z",
      venue_name: "Carroll Creek Amphitheater",
      lng: origin.lng,
      lat: origin.lat,
      category: "music",
    };
    const garage: ParkingPin = {
      slug: "carroll-creek",
      name: "Carroll Creek Garage",
      address: "44 East Patrick Street",
      lng: -77.4103,
      lat: 39.4142,
      available: null,
      percentFull: null,
      isFull: false,
      isFilling: false,
      updated: null,
    };
    const finding = buildMapDiscoveries(input({
      events: [event],
      parking: [garage],
      transitStops: [{ id: "100", name: "Downtown Transit Center", lng: -77.4104, lat: 39.4142 }],
    }))[0];

    expect(finding.points.map((point) => point.kind)).toEqual(["event", "parking"]);
    expect(finding.layers).toMatchObject({ parking: true });
    expect(finding.layers.transit).toBeUndefined();
  });

  it("requires real supporting facts instead of turning every event into filler", () => {
    const event: EventPin = {
      slug: "remote-event",
      title: "Remote Event",
      starts_at: "2026-07-22T21:00:00.000Z",
      venue_name: "Remote Venue",
      lng: -77.65,
      lat: 39.70,
      category: "community",
    };
    expect(buildMapDiscoveries(input({ events: [event] }))).toEqual([]);
  });

  it("suppresses event connections when the source does not name a venue", () => {
    const event: EventPin = {
      slug: "venue-missing",
      title: "Evening gathering",
      starts_at: "2026-07-22T21:00:00.000Z",
      venue_name: "   ",
      lng: origin.lng,
      lat: origin.lat,
      category: "community",
    };
    const restaurant = place({
      slug: "nearby-dinner",
      name: "Nearby Dinner",
      category: "restaurant",
      geom: { lng: -77.4103, lat: 39.4142 },
    });

    expect(buildMapDiscoveries(input({ events: [event], places: [restaurant] }))).toEqual([]);
  });

  it("turns raw transit feed suffixes into a useful stop label", () => {
    const event: EventPin = {
      slug: "taproom-yoga",
      title: "Yoga in the Taproom",
      starts_at: "2026-07-22T21:45:00.000Z",
      venue_name: "Steinhardt Brewing Company",
      lng: origin.lng,
      lat: origin.lat,
      category: "wellness",
    };
    const finding = buildMapDiscoveries(input({
      events: [event],
      transitStops: [{ id: "162962", name: "141 Thomas Johnson Drive- SRI", lng: -77.4102, lat: 39.4141 }],
    }))[0];

    expect(finding.summary).toContain("Transit stop at 141 Thomas Johnson Drive");
    expect(finding.summary).not.toContain("SRI");
  });

  it("uses nearest mapped wording for incomplete public-amenity coverage", () => {
    const park = place({ slug: "baker-park", name: "Baker Park", category: "park" });
    const amenities: Amenity[] = [
      { id: "field:restroom", kind: "restroom", name: "Park restroom", municipality: "frederick", lng: -77.4099, lat: 39.4142, photo: "/restroom.jpg" },
      { id: "field:water", kind: "water", name: "Bottle filler", municipality: "frederick", lng: -77.4097, lat: 39.4141, photo: "/water.jpg" },
    ];
    const finding = buildMapDiscoveries(input({ places: [park], amenities }))[0];
    expect(finding.kind).toBe("field-ready");
    expect(finding.summary).toContain("nearest mapped public restroom");
    expect(finding.evidence.every((item) => item.source === "Frederick Radius field map")).toBe(true);
    expect(finding.evidence.some((item) => item.fact.includes("Bottle filler · drinking water"))).toBe(true);
    expect(finding.layers.amenityGroups).toEqual(["restroom", "water"]);
  });

  it("links OpenStreetMap evidence to the actual contributed record", () => {
    const park = place({ slug: "baker-park", name: "Baker Park", category: "park" });
    const amenities: Amenity[] = [
      { id: "restroom-n-12345", kind: "restroom", name: "Public restroom", municipality: "frederick", lng: -77.4103, lat: 39.4142 },
      { id: "water-w-67890", kind: "water", name: "Bottle filler", municipality: "frederick", lng: -77.4102, lat: 39.4141 },
    ];
    const finding = buildMapDiscoveries(input({ places: [park], amenities }))[0];

    expect(finding.evidence[0]).toMatchObject({
      source: "OpenStreetMap contributors",
      sourceUrl: "https://www.openstreetmap.org/node/12345",
    });
    expect(finding.evidence[1].sourceUrl).toBe("https://www.openstreetmap.org/way/67890");
  });

  it("keeps mass-noun amenity copy grammatical", () => {
    const park = place({ slug: "baker-park", name: "Baker Park", category: "park" });
    const amenities: Amenity[] = [
      { id: "field:bench", kind: "bench", name: "Park bench", municipality: "frederick", lng: -77.4104, lat: 39.4143 },
      { id: "field:water", kind: "water", name: "Bottle filler", municipality: "frederick", lng: -77.4102, lat: 39.4141 },
    ];
    const finding = buildMapDiscoveries(input({ places: [park], amenities }))[0];
    expect(finding.summary).toContain("The nearest mapped drinking water");
    expect(finding.summary).not.toContain("A drinking water");
  });

  it("finds a compact county-town pocket without claiming any place is open", () => {
    const places = [
      place({ slug: "a", name: "Main Street Cafe", category: "coffee", municipality: "middletown", geom: { lng: -77.5447, lat: 39.4434 } }),
      place({ slug: "b", name: "Valley Books", category: "book-store", municipality: "middletown", geom: { lng: -77.5442, lat: 39.4436 } }),
      place({ slug: "c", name: "Town Park", category: "park", municipality: "middletown", geom: { lng: -77.5450, lat: 39.4438 } }),
      place({ slug: "d", name: "Local Table", category: "restaurant", municipality: "middletown", geom: { lng: -77.5452, lat: 39.4431 } }),
    ];
    const finding = buildMapDiscoveries(input({ places, origin: { lng: -77.5447, lat: 39.4434 } }))[0];
    expect(finding.kind).toBe("town-pocket");
    expect(finding.title).toContain("Middletown");
    expect(finding.summary.toLowerCase()).not.toContain("open");
    expect(finding.points).toHaveLength(4);
  });

  it("diversifies recipes before repeating the same kind", () => {
    const parks = [
      place({ slug: "park-one", name: "Park One", category: "park" }),
      place({ slug: "park-two", name: "Park Two", category: "park", geom: { lng: -77.412, lat: 39.414 } }),
    ];
    const amenities: Amenity[] = [
      { id: "r", kind: "restroom", name: "Restroom", municipality: "frederick", lng: -77.4104, lat: 39.4143 },
      { id: "w", kind: "water", name: "Water", municipality: "frederick", lng: -77.4103, lat: 39.4142 },
    ];
    const cemetery = { id: "cem", name: "Old Cemetery", approximate: false, lng: -77.4105, lat: 39.4143 };
    const aerialPhotos = [
      { src: "/fall.jpg", season: "fall" as const, takenAt: "2025-10-01", lng: -77.411, lat: 39.414 },
      { src: "/winter.jpg", season: "winter" as const, takenAt: "2026-01-01", lng: -77.412, lat: 39.415 },
    ];
    const result = buildMapDiscoveries(input({ places: parks, amenities, cemeteries: [cemetery], aerialPhotos, limit: 2 }));
    expect(new Set(result.map((item) => item.kind)).size).toBe(2);
  });

  it("clips every joined source to the settled viewport", () => {
    const event: EventPin = {
      slug: "edge-event",
      title: "Edge event",
      starts_at: "2026-07-22T21:00:00.000Z",
      venue_name: "Edge Venue",
      lng: -77.4105,
      lat: 39.4143,
      category: "music",
    };
    const outsideFood = place({
      slug: "outside-food",
      name: "Outside Food",
      category: "restaurant",
      geom: { lng: -77.4098, lat: 39.4143 },
    });
    const bounds = { west: -77.411, east: -77.4100, south: 39.4140, north: 39.4146 };

    expect(buildMapDiscoveries(input({
      events: [event],
      places: [outsideFood],
      bounds,
      // Deliberately near the excluded place; viewport center must win.
      origin: outsideFood.geom,
    }))).toEqual([]);
  });

  it("ranks Read this area from the viewport center instead of device origin", () => {
    const centerPark = place({ slug: "center-park", name: "Center Park", category: "park", geom: { lng: -77.410, lat: 39.4143 } });
    const edgePark = place({ slug: "edge-park", name: "Edge Park", category: "park", geom: { lng: -77.419, lat: 39.4143 } });
    const amenities: Amenity[] = [
      { id: "center-r", kind: "restroom", name: "Center restroom", municipality: "frederick", lng: -77.4101, lat: 39.4143 },
      { id: "center-w", kind: "water", name: "Center water", municipality: "frederick", lng: -77.4102, lat: 39.4143 },
      { id: "edge-r", kind: "restroom", name: "Edge restroom", municipality: "frederick", lng: -77.4189, lat: 39.4143 },
      { id: "edge-w", kind: "water", name: "Edge water", municipality: "frederick", lng: -77.4188, lat: 39.4143 },
    ];
    const finding = buildMapDiscoveries(input({
      places: [edgePark, centerPark],
      amenities,
      origin: edgePark.geom,
      bounds: { west: -77.420, east: -77.400, south: 39.410, north: 39.4186 },
      limit: 1,
    }))[0];

    expect(finding.id).toBe("field-ready:center-park");
  });

  it("opens a history finding at a dated aerial record and states precision", () => {
    const cemetery = { id: "cem", name: "Old Cemetery", approximate: true, lng: -77.4105, lat: 39.4143 };
    const aerialPhotos = [
      { src: "/fall.jpg", season: "fall" as const, takenAt: "2025-10-01", lng: -77.411, lat: 39.414 },
      { src: "/winter.jpg", season: "winter" as const, takenAt: "2026-01-01", lng: -77.412, lat: 39.415 },
    ];
    const finding = buildMapDiscoveries(input({ cemeteries: [cemetery], aerialPhotos }))[0];

    expect(finding.href).toContain("show=aerial,cemeteries");
    expect(finding.href).toContain("aerial=%2Ffall.jpg");
    expect(finding.actionLabel).toBe("Open 2025 aerial");
    expect(finding.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ precision: "approximate" }),
      expect.objectContaining({ observedAt: "2025-10-01", precision: "exact" }),
    ]));
  });

  it("does not promote an incomplete cemetery source label into a headline", () => {
    const cemetery = { id: "cem", name: "Colored", place: "Frederick City", approximate: false, lng: -77.4105, lat: 39.4143 };
    const aerialPhotos = [
      { src: "/fall.jpg", season: "fall" as const, takenAt: "2025-10-01", lng: -77.411, lat: 39.414 },
      { src: "/winter.jpg", season: "winter" as const, takenAt: "2026-01-01", lng: -77.412, lat: 39.415 },
    ];
    const result = buildMapDiscoveries(input({ cemeteries: [cemetery], aerialPhotos }));
    expect(result.some((item) => item.kind === "history-from-above")).toBe(false);
  });
});
