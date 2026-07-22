import { describe, expect, it } from "vitest";
import { rankMapListPlaces } from "./MapList";
import type { MapPinPlace } from "./types";

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
