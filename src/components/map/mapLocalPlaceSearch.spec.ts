import { describe, expect, it } from "vitest";
import type { MapPinPlace } from "./types";
import {
  confidentLocalMapPlaceResult,
  immediateMapPlaceResults,
  mapPlaceNameConfidence,
  reconcileMapSearchResults,
} from "./mapLocalPlaceSearch";

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

  it("treats punctuation and connector-free business names as exact", () => {
    expect(mapPlaceNameConfidence("Gravel & Grind", "gravel grind")).toBe(
      "exact",
    );
    expect(mapPlaceNameConfidence("The Common Market", "common market")).toBe(
      "exact",
    );
  });

  it("only promotes a prefix when it identifies one known place", () => {
    const ambiguous = immediateMapPlaceResults(places, "grav", null);
    expect(confidentLocalMapPlaceResult(ambiguous, "grav")).toBeNull();

    const specific = immediateMapPlaceResults(places, "gravel and gr", null);
    expect(confidentLocalMapPlaceResult(specific, "gravel and gr")?.id).toBe(
      "place:gravel-and-grind-frederick",
    );
  });

  it("preserves a canonical exact result and drops server fragment noise", () => {
    const immediate = immediateMapPlaceResults(
      places,
      "Gravel and Grind",
      null,
    );
    const merged = reconcileMapSearchResults(
      immediate,
      [
        {
          type: "place",
          id: "place:gravelly-point-example",
          title: "Gravelly Point",
          subtitle: "Park",
          href: "/places/gravelly-point-example",
        },
        {
          type: "action",
          id: "action:map-coffee",
          title: "Show coffee on the map",
          subtitle: "Map action",
          href: "/map?intent=coffee",
        },
      ],
      "Gravel and Grind",
    );

    expect(merged.map((result) => result.id)).toEqual([
      "place:gravel-and-grind-frederick",
      "action:map-coffee",
    ]);
  });

  it("keeps the server's ranking when there is no confident local name", () => {
    const immediate = immediateMapPlaceResults(places, "gravel", null);
    const server = [
      {
        type: "category" as const,
        id: "category:outdoors",
        title: "Parks & trails",
        subtitle: "Category",
        href: "/category/outdoors",
      },
    ];
    expect(reconcileMapSearchResults(immediate, server, "gravel")[0]?.id).toBe(
      "category:outdoors",
    );
  });

  it("keeps the live browser distance when the server returns the same place", () => {
    const immediate = immediateMapPlaceResults(
      places,
      "gravel",
      { lat: 39.415, lng: -77.41 },
    );
    const local = immediate.find(
      (result) => result.id === "place:gravel-and-grind-frederick",
    );
    const server = [{
      type: "place" as const,
      id: "place:gravel-and-grind-frederick",
      title: "Gravel & Grind",
      subtitle: "Coffee",
      href: "/places/gravel-and-grind-frederick",
      distance_m: 174,
    }];

    const [merged] = reconcileMapSearchResults(immediate, server, "gravel");
    expect(merged?.distance_m).toBe(local?.distance_m);
    expect(merged?.distance_m).not.toBe(174);
  });
});
