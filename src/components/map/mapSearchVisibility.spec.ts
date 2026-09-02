import { describe, expect, it } from "vitest";
import type { SearchResult } from "@/lib/search/index";
import {
  mapSearchResultLimit,
  mapSearchResultsForRenderer,
} from "./mapSearchVisibility";

describe("map search result visibility", () => {
  it("keeps keyboard and visual options aligned on phones", () => {
    expect(mapSearchResultLimit(320)).toBe(3);
    expect(mapSearchResultLimit(390)).toBe(3);
    expect(mapSearchResultLimit(520)).toBe(3);
  });

  it("retains four immediate options when the viewport has room", () => {
    expect(mapSearchResultLimit(521)).toBe(4);
    expect(mapSearchResultLimit(1024)).toBe(4);
  });

  it("keeps navigable results but removes renderer-only commands without a map", () => {
    const results: SearchResult[] = [
      {
        type: "place",
        id: "place:gravel-and-grind-frederick",
        title: "Gravel & Grind",
        subtitle: "Coffee · Frederick",
        href: "/places/gravel-and-grind-frederick",
      },
      {
        type: "municipality",
        id: "municipality:brunswick",
        title: "Brunswick",
        subtitle: "Town",
        href: "/towns/brunswick",
      },
      {
        type: "action",
        id: "action:events",
        title: "Events",
        subtitle: "Browse events",
        href: "/events",
      },
      {
        type: "action",
        id: "layer:parks",
        title: "Show parks on the map",
        subtitle: "Open data",
        href: "/map?layers=parks",
      },
      {
        type: "action",
        id: "action:map-live-buses",
        title: "Show live buses",
        subtitle: "Map command",
        href: "/map?show=transit",
      },
      {
        type: "action",
        id: "action:radius",
        title: "What's near me",
        subtitle: "Set a point and a distance",
        href: "/map?mode=radius",
      },
      {
        type: "action",
        id: "action:map",
        title: "Open the map",
        subtitle: "See Frederick County places on a map",
        href: "/map",
      },
      {
        type: "place",
        id: "mapbox:temporary-address",
        title: "Temporary address",
        subtitle: "Temporary Mapbox result",
        href: "#",
        temporary: true,
        provider: "Mapbox",
      },
    ];

    expect(
      mapSearchResultsForRenderer(results, false).map((result) => result.id),
    ).toEqual([
      "place:gravel-and-grind-frederick",
      "municipality:brunswick",
      "action:events",
    ]);
    expect(mapSearchResultsForRenderer(results, true)).toEqual(results);
  });
});
