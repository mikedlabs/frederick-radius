import { describe, expect, it } from "vitest";
import type { MapPinPlace } from "./types";
import { immediateMapPlaceResults } from "./mapLocalPlaceSearch";

function place(
  value: Pick<MapPinPlace, "slug" | "name" | "category" | "geom">,
): MapPinPlace {
  return {
    ...value,
    subcategories: [],
    open_status: { state: "unknown" },
    is_verified: true,
    field_notes: false,
    deal_hook: undefined,
    source: "manual",
    municipality: "frederick",
    short_blurb: "",
    primary_type: value.category,
  };
}

const places: MapPinPlace[] = [
  place({
    slug: "gravel-and-grind-frederick",
    name: "Gravel & Grind",
    category: "coffee",
    geom: { lat: 39.4161, lng: -77.4092 },
  }),
  place({
    slug: "gravelly-point-example",
    name: "Gravelly Point",
    category: "parks",
    geom: { lat: 39.5, lng: -77.5 },
  }),
];

describe("immediateMapPlaceResults", () => {
  it("matches a known business name without waiting for the search API", () => {
    const [result] = immediateMapPlaceResults(
      places,
      "Gravel and Grind",
      { lat: 39.415, lng: -77.41 },
    );

    expect(result).toMatchObject({
      id: "place:gravel-and-grind-frederick",
      title: "Gravel & Grind",
      type: "place",
    });
    expect(result?.distance_m).toBeTypeOf("number");
  });

  it("does not manufacture a partial category search", () => {
    expect(immediateMapPlaceResults(places, "coffee", null)).toEqual([]);
  });

  it("prefers an exact normalized name over a looser word match", () => {
    const results = immediateMapPlaceResults(places, "gravel grind", null);
    expect(results[0]?.id).toBe("place:gravel-and-grind-frederick");
  });
});
