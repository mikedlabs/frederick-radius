import { describe, expect, it } from "vitest";
import { rankMapListEvents, rankMapListPlaces } from "./MapList";
import type { EventPin, MapPinPlace } from "./types";

function place(slug: string, lng: number): MapPinPlace {
  return {
    slug,
    name: slug,
    category: "restaurants",
    subcategories: [],
    geom: { lng, lat: 39.4 },
    open_status: { state: "open", closesAt: "23:00", closingSoon: false },
    source: "manual",
    is_verified: true,
    municipality: "frederick",
    short_blurb: "A test place.",
  };
}

function event(slug: string, startsAt: string, lng: number): EventPin {
  return {
    slug,
    title: slug,
    starts_at: startsAt,
    venue_name: "Test venue",
    lng,
    lat: 39.4,
    category: "community",
  };
}

describe("rankMapListPlaces", () => {
  it("ranks from the visible map origin when no device fix is available", () => {
    const rows = rankMapListPlaces(
      [place("west", -77.7), place("center", -77.4), place("east", -77.1)],
      { lng: -77.12, lat: 39.4 },
    );

    expect(rows.map((row) => row.slug)).toEqual(["east", "center", "west"]);
  });

  it("keeps the result cap after spatial ranking", () => {
    const rows = rankMapListPlaces(
      [place("far", -77.7), place("near", -77.2), place("middle", -77.4)],
      { lng: -77.2, lat: 39.4 },
      2,
    );

    expect(rows.map((row) => row.slug)).toEqual(["near", "middle"]);
  });
});

describe("rankMapListEvents", () => {
  it("puts the sooner event first even when a later event is closer", () => {
    const rows = rankMapListEvents(
      [
        event("later-nearby", "2026-07-23T00:00:00.000Z", -77.2),
        event("sooner-farther", "2026-07-22T23:00:00.000Z", -77.4),
      ],
      { lng: -77.2, lat: 39.4 },
    );

    expect(rows.map((row) => row.slug)).toEqual(["sooner-farther", "later-nearby"]);
  });

  it("uses distance to break a start-time tie", () => {
    const rows = rankMapListEvents(
      [
        event("far", "2026-07-22T23:00:00.000Z", -77.5),
        event("near", "2026-07-22T23:00:00.000Z", -77.21),
      ],
      { lng: -77.2, lat: 39.4 },
    );

    expect(rows.map((row) => row.slug)).toEqual(["near", "far"]);
  });
});
