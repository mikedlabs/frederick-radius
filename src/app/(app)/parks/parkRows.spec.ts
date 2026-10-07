import { describe, expect, it } from "vitest";
import { CURATED_PARKS, CURATED_PARK_CATALOG_NAMES } from "@/data/curated-parks";
import { publicPlaces, publicPlaceBySlug } from "@/lib/loaders/places";
import { OVERVIEW_VIEW_HEIGHT, OVERVIEW_VIEW_WIDTH } from "@/components/map/countyOverview";
import {
  formatParkAcres,
  parkAcreageShare,
  parkMatchRadiusMeters,
  parkOverviewPoints,
  parkPlaceSlug,
  parkRowHref,
  titleCaseParkName,
  type CatalogPlace,
} from "./parkRows";

const park = (id: string) => {
  const found = CURATED_PARKS.find((p) => p.id === id);
  if (!found) throw new Error(`no curated park ${id}`);
  return found;
};

describe("titleCaseParkName", () => {
  it("does not capitalize the letter after an apostrophe", () => {
    expect(titleCaseParkName("WORMAN'S MILL PARK")).toBe("Worman's Mill Park");
    expect(titleCaseParkName("CRAMPTON'S GAP")).toBe("Crampton's Gap");
  });

  it("keeps initials, parentheses and small words right", () => {
    expect(titleCaseParkName("C&O CANAL NATIONAL HISTORICAL PARK (FREDERICK SEGMENTS)")).toBe(
      "C&O Canal National Historical Park (Frederick Segments)",
    );
    expect(titleCaseParkName("MEMORIAL PARK (THURMONT)")).toBe("Memorial Park (Thurmont)");
    expect(titleCaseParkName("BOROUGH OF SOMEWHERE")).toBe("Borough of Somewhere");
    expect(titleCaseParkName("FOUNTAIN ROCK PARK & NATURE CENTER")).toBe(
      "Fountain Rock Park & Nature Center",
    );
  });
});

describe("parkPlaceSlug against the real catalog", () => {
  const catalog = publicPlaces();
  const linked = new Map(CURATED_PARKS.map((p) => [p.id, parkPlaceSlug(p, catalog)]));

  it("links reviewed parks to their own place pages", () => {
    expect(linked.get("baker-park")).toBe("baker-park-frederick");
    expect(linked.get("catoctin-mountain-park")).toBe("catoctin-mountain-park");
    expect(linked.get("monocacy-national-battlefield")).toBe("monocacy-national-battlefield-frederick");
    expect(linked.get("thurmont-community-park")).toBe("thurmont-community-park-thurmont");
  });

  it("uses the reviewed catalog name where the record names the park differently", () => {
    expect(CURATED_PARK_CATALOG_NAMES["carroll-creek-park"]).toBe("Carroll Creek Linear Park");
    expect(linked.get("carroll-creek-park")).toBe("carroll-creek-linear-park-frederick");
  });

  it("refuses a same-named place outside the park's footprint", () => {
    // The catalog's Othello Regional Park sits about 20 km from the record.
    expect(catalog.some((p) => p.name === "Othello Regional Park")).toBe(true);
    expect(linked.get("othello-park")).toBeNull();
  });

  it("only ever links a slug that resolves to a public place page", () => {
    for (const slug of linked.values()) {
      if (slug) expect(publicPlaceBySlug(slug)?.slug).toBe(slug);
    }
    expect([...linked.values()].filter(Boolean).length).toBeGreaterThanOrEqual(8);
  });
});

describe("parkPlaceSlug rules", () => {
  const baker = park("baker-park");
  const near = { lng: baker.lng + 0.002, lat: baker.lat };

  it("requires the exact name, not a longer one", () => {
    const places: CatalogPlace[] = [
      { slug: "baker-park-bandshell", name: "Baker Park Bandshell", geom: near },
    ];
    expect(parkPlaceSlug(baker, places)).toBeNull();
  });

  it("ignores case and punctuation, and takes the nearest exact match", () => {
    const places: CatalogPlace[] = [
      { slug: "far", name: "Baker Park", geom: { lng: baker.lng + 0.006, lat: baker.lat } },
      { slug: "near", name: "BAKER PARK.", geom: near },
    ];
    expect(parkPlaceSlug(baker, places)).toBe("near");
  });

  it("scales the allowed distance with the park's size", () => {
    expect(parkMatchRadiusMeters(undefined)).toBe(500);
    expect(parkMatchRadiusMeters(44)).toBeCloseTo(738, 0);
    expect(parkMatchRadiusMeters(5810)).toBeGreaterThan(3000);
  });

  it("falls back to the map when nothing matches", () => {
    expect(parkRowHref(baker, null)).toBe(`/map?at=${baker.lat},${baker.lng}`);
    expect(parkRowHref(baker, "baker-park-frederick")).toBe("/places/baker-park-frederick");
  });
});

describe("acreage", () => {
  const max = Math.max(...CURATED_PARKS.map((p) => p.acres ?? 0));

  it("formats with a thousands separator", () => {
    expect(formatParkAcres(5810)).toBe("5,810 ac");
    expect(formatParkAcres(44)).toBe("44 ac");
  });

  it("draws a bar that keeps order, shows small parks and fills at the largest", () => {
    expect(parkAcreageShare(max, max)).toBe(100);
    expect(parkAcreageShare(5, max)).toBe(4);
    const shares = [5, 44, 200, 1137, 5810, max].map((a) => parkAcreageShare(a, max)!);
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
    expect(parkAcreageShare(undefined, max)).toBeNull();
    expect(parkAcreageShare(0, max)).toBeNull();
  });
});

describe("parkOverviewPoints", () => {
  const points = parkOverviewPoints(CURATED_PARKS);

  it("pins every park inside the frame: 33 parks at 32 distinct points", () => {
    expect(points).toHaveLength(33);
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBe(32);
    for (const p of points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(OVERVIEW_VIEW_WIDTH);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(OVERVIEW_VIEW_HEIGHT);
      expect(p.href).toBeUndefined();
    }
  });

  it("orders by acreage and labels only the big public lands", () => {
    expect(points[0].id).toBe("south-mountain-creamery");
    const labeled = points.filter((p) => p.label);
    expect(labeled.length).toBeGreaterThan(0);
    for (const p of labeled) {
      expect(park(p.id).acres ?? 0).toBeGreaterThanOrEqual(1000);
      expect(p.label!.length).toBeLessThanOrEqual(28);
    }
    expect(labeled.map((p) => p.label)).toContain("Catoctin Mountain Park");
  });
});
