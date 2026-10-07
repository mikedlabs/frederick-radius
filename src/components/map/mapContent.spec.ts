import { describe, expect, it } from "vitest";
import {
  OVERVIEW_EVENT_LIMIT,
  PLACE_LABEL_ALL_ZOOM,
  PLACE_LABEL_EARLY_ZOOM,
  PLACE_LABEL_HALO_WIDTH,
  PLACE_LABEL_SIZE,
  curatedPlaceLabelField,
  curatedPlaceLabelFont,
  curatedPlaceLabelOpacity,
  curatedPlaceLabelSize,
  curatedPlaceSortKey,
  discoveryTrustLine,
  eventGroupAriaLabel,
  eventMarkerAriaLabel,
  formatMapTimestamp,
  groupMapEvents,
  mapContentsSummary,
  overviewEventMarkers,
  placeLabelRank,
  radiusResultLine,
  townPeekKicker,
} from "./mapContent";
import {
  MAPBOX_LABEL_FONT_BOLD,
  MAPBOX_LABEL_FONT_MEDIUM,
} from "./mapboxFieldGuideStyle";
import type { EventPin, MapLineFC, MapPinPlace } from "./types";

describe("formatMapTimestamp", () => {
  it("formats a source time in Frederick's Eastern timezone", () => {
    expect(formatMapTimestamp("2026-07-23T00:15:00.000Z")).toBe("Jul 22, 8:15 PM");
  });

  it("stays quiet for missing or invalid source times", () => {
    expect(formatMapTimestamp(null)).toBeNull();
    expect(formatMapTimestamp("not-a-date")).toBeNull();
  });
});

describe("discoveryTrustLine", () => {
  it("deduplicates sources and exposes a real evidence date", () => {
    expect(discoveryTrustLine([
      { fact: "One", source: "Frederick County GIS" },
      { fact: "Two", source: "Frederick County GIS" },
      { fact: "Three", source: "Radius field map", observedAt: "2026-07-23T00:15:00.000Z" },
    ])).toBe("Sources: Frederick County GIS + Radius field map · dated Jul 22, 8:15 PM");
  });

  it("does not imply freshness when the evidence is undated", () => {
    expect(discoveryTrustLine([
      { fact: "One", source: "City parking data" },
    ])).toBe("Sources: City parking data");
  });
});

describe("radiusResultLine", () => {
  it("leads with reachable and confirmed-open counts", () => {
    expect(radiusResultLine(61, 18)).toBe("61 places · 18 confirmed open");
    expect(radiusResultLine(1, 1)).toBe("1 place · 1 confirmed open");
  });

  it("describes the filtered result rather than the hidden total", () => {
    expect(radiusResultLine(61, 18, true)).toBe("18 confirmed open within reach");
  });

  it("keeps an empty radius distinct from an hours-coverage gap", () => {
    expect(radiusResultLine(0, 0)).toBe("No places within reach");
    expect(radiusResultLine(0, 0, true)).toBe("No places within reach");
  });

  it("does not turn an unknown-hours zero into a closure claim", () => {
    expect(radiusResultLine(61, 0)).toBe(
      "61 places · Open hours unconfirmed",
    );
    expect(radiusResultLine(61, 0, true)).toBe(
      "Open hours unconfirmed within reach",
    );
  });

  it("only reports none open after the caller clears the coverage gate", () => {
    expect(radiusResultLine(61, 0, false, true)).toBe(
      "61 places · None open now",
    );
    expect(radiusResultLine(61, 0, true, true)).toBe(
      "None open within reach",
    );
  });
});

describe("mapContentsSummary", () => {
  it("leads with area and the strongest active task", () => {
    expect(mapContentsSummary({
      area: "Frederick",
      amenity: "Restrooms",
      intent: "Coffee",
      time: "Tonight",
    })).toBe("Frederick · Restrooms");
  });

  it("stays quiet when the map has no refinement", () => {
    expect(mapContentsSummary({ area: "County" })).toBe("Contents");
  });
});

describe("groupMapEvents", () => {
  const event = (partial: Partial<EventPin>): EventPin => ({
    slug: "event",
    title: "Event",
    starts_at: "2026-07-23T22:00:00.000Z",
    venue_name: "Carroll Creek",
    lng: -77.4101,
    lat: 39.4142,
    category: "community",
    ...partial,
  });

  it("keeps co-located events in one chronological map group", () => {
    const groups = groupMapEvents([
      event({ slug: "late", title: "Late", starts_at: "2026-07-24T01:00:00.000Z" }),
      event({ slug: "early", title: "Early", starts_at: "2026-07-23T21:00:00.000Z" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].venueLabel).toBe("Carroll Creek");
    expect(groups[0].events.map((item) => item.slug)).toEqual(["early", "late"]);
  });

  it("does not hide events at distinct points", () => {
    const groups = groupMapEvents([
      event({ slug: "one" }),
      event({ slug: "two", lng: -77.4201 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.flatMap((group) => group.events)).toHaveLength(2);
  });

  it("names a group by its place, never by a placeholder", () => {
    // Two spellings of one building used to fall back to "Events here".
    const [mixed] = groupMapEvents([
      event({ slug: "a", venue_name: "Weinberg Center", starts_at: "2026-07-23T21:00:00.000Z" }),
      event({ slug: "b", venue_name: "The Weinberg Center for the Arts", starts_at: "2026-07-23T23:00:00.000Z" }),
    ]);
    expect(mixed.venueLabel).toBe("Weinberg Center");
    expect(mixed.venueKnown).toBe(true);
    expect(mixed.venueLabel).not.toBe("Events here");
  });

  it("falls back to the first event's title when no row names a venue", () => {
    const [blank] = groupMapEvents([
      event({ slug: "trivia", title: "Trivia Night", venue_name: "", starts_at: "2026-07-23T21:00:00.000Z" }),
      event({ slug: "bingo", title: "Bingo", venue_name: "  ", starts_at: "2026-07-23T23:00:00.000Z" }),
    ]);
    expect(blank.venueLabel).toBe("Trivia Night");
    expect(blank.venueKnown).toBe(false);
    expect(eventGroupAriaLabel(blank)).toBe("2 events, starting with Trivia Night");
  });
});

describe("event marker names", () => {
  const event = (partial: Partial<EventPin>): EventPin => ({
    slug: "event",
    title: "Trivia Night",
    starts_at: "2026-07-23T22:00:00.000Z",
    venue_name: "",
    lng: -77.4101,
    lat: 39.4142,
    category: "community",
    ...partial,
  });

  it("never leaves a dangling 'at' when the venue is empty", () => {
    expect(eventMarkerAriaLabel(event({}))).toBe("Trivia Night");
    expect(eventMarkerAriaLabel(event({ venue_name: "The Den" }))).toBe("Trivia Night at The Den");
  });

  it("names a counted group by its venue", () => {
    const [group] = groupMapEvents([
      event({ slug: "a", venue_name: "The Den" }),
      event({ slug: "b", venue_name: "The Den", starts_at: "2026-07-24T00:00:00.000Z" }),
    ]);
    expect(eventGroupAriaLabel(group)).toBe("2 events at The Den");
  });
});

describe("place names on the map", () => {
  const place = (partial: Partial<MapPinPlace>) => ({
    category: "restaurant",
    field_notes: false,
    short_blurb: "",
    local_favorite: false,
    ...partial,
  });

  it("names field notes first, then a reviewed description, then a favorite", () => {
    expect(placeLabelRank(place({ field_notes: true, short_blurb: "Wood-fired pizza." }))).toBe(0);
    expect(placeLabelRank(place({ short_blurb: "Wood-fired pizza." }))).toBe(1);
    expect(placeLabelRank(place({ local_favorite: true }))).toBe(2);
    expect(placeLabelRank(place({}))).toBe(3);
  });

  it("does not name a favorite print shop or salon ahead of the block", () => {
    expect(placeLabelRank(place({ category: "services", local_favorite: true }))).toBe(3);
    expect(placeLabelRank(place({ category: "salon", local_favorite: true }))).toBe(3);
    expect(placeLabelRank(place({ category: "coffee", local_favorite: true }))).toBe(2);
  });

  it("names the early tier from z14 and every place from z15", () => {
    const field = curatedPlaceLabelField({ selectedSlug: null, compact: false }) as unknown[];
    expect(field[0]).toBe("step");
    expect(JSON.stringify(field)).toContain(`"labelRank"`);
    expect(field).toContain(15);
    expect(field.at(-1)).toEqual(["get", "name"]);
    expect(PLACE_LABEL_EARLY_ZOOM).toBe(14);
    expect(PLACE_LABEL_ALL_ZOOM).toBe(15.5);
    // Small subject maps name everything they draw.
    expect(curatedPlaceLabelField({ selectedSlug: null, compact: true })).toEqual(["get", "name"]);
  });

  it("reveals the rest at z15.5 and keeps the selected place readable", () => {
    const ramp = curatedPlaceLabelOpacity({
      selectedSlug: "black-hog",
      compact: false,
      hidden: false,
      receded: false,
    }) as unknown[];
    expect(ramp[0]).toBe("interpolate");
    expect(ramp).toContain(15.5);
    expect(JSON.stringify(ramp)).toContain(`"black-hog"`);
    expect(
      curatedPlaceLabelOpacity({ selectedSlug: "black-hog", compact: false, hidden: true, receded: false }),
    ).toBe(0);
    expect(
      curatedPlaceLabelOpacity({ selectedSlug: "black-hog", compact: false, hidden: false, receded: true }),
    ).toEqual(["case", ["==", ["get", "slug"], "black-hog"], 1, 0.14]);
  });

  it("sets names at 11.5 and the selected place at 13 in the bold stack", () => {
    expect(PLACE_LABEL_SIZE).toBe(11.5);
    expect(PLACE_LABEL_HALO_WIDTH).toBe(1.2);
    expect(curatedPlaceLabelSize("black-hog")).toEqual([
      "case",
      ["==", ["get", "slug"], "black-hog"],
      13,
      11.5,
    ]);
    const font = JSON.stringify(curatedPlaceLabelFont("black-hog"));
    expect(font).toContain(JSON.stringify(MAPBOX_LABEL_FONT_BOLD));
    expect(font).toContain(JSON.stringify(MAPBOX_LABEL_FONT_MEDIUM));
    // The selected place wins placement, then rank, then verification.
    expect(curatedPlaceSortKey("black-hog")).toEqual([
      "case",
      ["==", ["get", "slug"], "black-hog"],
      -1,
      ["+", ["*", ["coalesce", ["get", "labelRank"], 3], 2], ["coalesce", ["get", "pri"], 1]],
    ]);
  });
});

describe("overviewEventMarkers", () => {
  // Tue Oct 6 2026, 6:00 PM Eastern.
  const now = new Date("2026-10-06T22:00:00.000Z");
  const event = (partial: Partial<EventPin>): EventPin => ({
    slug: "event",
    title: "Event",
    starts_at: "2026-10-06T23:00:00.000Z",
    venue_name: "Hall",
    lng: -77.41,
    lat: 39.414,
    category: "music",
    ...partial,
  });

  it("keeps only events underway or starting within two hours", () => {
    const markers = overviewEventMarkers([
      event({ slug: "soon", title: "Bluegrass Jam", starts_at: "2026-10-06T23:00:00.000Z" }),
      event({
        slug: "underway",
        title: "Gallery talk",
        starts_at: "2026-10-06T21:00:00.000Z",
        ends_at: "2026-10-06T23:30:00.000Z",
        lng: -77.2,
      }),
      event({ slug: "later", starts_at: "2026-10-07T01:30:00.000Z", lng: -77.3 }),
      event({ slug: "tomorrow", starts_at: "2026-10-07T16:00:00.000Z", lng: -77.35 }),
      event({ slug: "all-day", is_all_day: true, starts_at: "2026-10-06T04:00:00.000Z", lng: -77.45 }),
      // Started with no trustworthy end: never claimed as underway.
      event({ slug: "unknown-end", starts_at: "2026-10-06T21:30:00.000Z", lng: -77.5 }),
    ], { now, zoom: 9.6 });
    expect(markers.map((marker) => marker.event.slug)).toEqual(["underway", "soon"]);
    expect(markers[0]).toMatchObject({ live: true, timeLabel: "Now" });
    expect(markers[0].ariaLabel).toBe("Gallery talk, happening now, Hall");
    expect(markers[1]).toMatchObject({ live: false, timeLabel: "7 PM" });
    expect(markers[1].ariaLabel).toBe("Bluegrass Jam, starts at 7 PM, Hall");
  });

  it("marks at most six, one per venue, soonest first", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      event({
        slug: `e${index}`,
        starts_at: new Date(now.getTime() + (index + 1) * 10 * 60_000).toISOString(),
        lng: -77.6 + index * 0.05,
      }),
    );
    const sameVenue = event({ slug: "twin", starts_at: many[0].starts_at, lng: many[0].lng });
    const markers = overviewEventMarkers([...many, sameVenue], { now, zoom: 9.6 });
    expect(markers).toHaveLength(OVERVIEW_EVENT_LIMIT);
    expect(markers.map((marker) => marker.event.slug)).toEqual(["e0", "e1", "e2", "e3", "e4", "e5"]);
  });

  it("drops a pill that would print over a nearby marker but keeps its dot", () => {
    const markers = overviewEventMarkers([
      event({ slug: "first", starts_at: "2026-10-06T22:30:00.000Z", lng: -77.4105, lat: 39.4143 }),
      event({ slug: "second", starts_at: "2026-10-06T23:00:00.000Z", lng: -77.4095, lat: 39.4146 }),
    ], { now, zoom: 9.6 });
    expect(markers).toHaveLength(2);
    expect(markers[0].showPill).toBe(true);
    expect(markers[1].showPill).toBe(false);
    // Far enough apart at street zoom, both pills print.
    const close = overviewEventMarkers([
      event({ slug: "first", starts_at: "2026-10-06T22:30:00.000Z", lng: -77.4105, lat: 39.4143 }),
      event({ slug: "second", starts_at: "2026-10-06T23:00:00.000Z", lng: -77.4095, lat: 39.4126 }),
    ], { now, zoom: 17 });
    expect(close.every((marker) => marker.showPill)).toBe(true);
  });
});

describe("townPeekKicker", () => {
  const boundaries: MapLineFC = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { slug: "walkersville", name: "Walkersville" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [[-77.36, 39.47], [-77.33, 39.47], [-77.33, 39.5], [-77.36, 39.5], [-77.36, 39.47]],
            // A hole the town does not cover.
            [[-77.35, 39.48], [-77.34, 39.48], [-77.34, 39.49], [-77.35, 39.49], [-77.35, 39.48]],
          ],
        },
      },
    ],
  };

  it("says You are in only for a fix inside the town boundary", () => {
    expect(townPeekKicker({ slug: "walkersville", userLoc: { lng: -77.355, lat: 39.475 }, boundaries }))
      .toBe("You are in");
    expect(townPeekKicker({ slug: "walkersville", userLoc: { lng: -77.345, lat: 39.485 }, boundaries }))
      .toBe("Town");
    expect(townPeekKicker({ slug: "walkersville", userLoc: { lng: -77.41, lat: 39.414 }, boundaries }))
      .toBe("Town");
  });

  it("says Town without a fix or without the boundary", () => {
    expect(townPeekKicker({ slug: "walkersville", userLoc: null, boundaries })).toBe("Town");
    expect(townPeekKicker({
      slug: "walkersville",
      userLoc: { lng: -77.355, lat: 39.475 },
      boundaries: { type: "FeatureCollection", features: [] },
    })).toBe("Town");
  });
});
