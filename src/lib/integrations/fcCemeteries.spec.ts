import { describe, it, expect } from "vitest";
import { normalizeCemeteries } from "./fcCemeteries";

// A point near Foxville (inside the county ring) — a real row's shape.
const FOXVILLE = { lng: -77.4991, lat: 39.6719 };
// Westminster (Carroll County) — the source carries a few reference
// points over the county line; the ring gate must drop them.
const WESTMINSTER = { lng: -76.9958, lat: 39.5754 };

function feature(over: {
  props?: Record<string, unknown>;
  coords?: [number, number] | null;
  type?: string;
}) {
  return {
    type: "Feature",
    geometry:
      over.coords === null
        ? null
        : { type: over.type ?? "Point", coordinates: over.coords ?? [FOXVILLE.lng, FOXVILLE.lat] },
    properties: {
      FID: 2,
      Name: "Mt Zion Methodist Church",
      PlaceName: "Foxville",
      LocType: "Located",
      ...over.props,
    },
  };
}
const fc = (features: unknown[]) => ({ type: "FeatureCollection", features });

describe("normalizeCemeteries", () => {
  it("maps a located county cemetery", () => {
    const rows = normalizeCemeteries(fc([feature({})]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "2",
      name: "Mt Zion Methodist Church",
      place: "Foxville",
      approximate: false,
    });
    expect(rows[0].lng).toBeCloseTo(FOXVILLE.lng, 4);
  });

  it("flags approximate locations instead of dropping them", () => {
    const rows = normalizeCemeteries(
      fc([feature({ props: { LocType: "Approximate Location" } })]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].approximate).toBe(true);
  });

  it("drops rows the county marks Location Unknown", () => {
    expect(
      normalizeCemeteries(fc([feature({ props: { LocType: "Location Unknown" } })])),
    ).toEqual([]);
  });

  it("drops points outside the Frederick County ring", () => {
    expect(
      normalizeCemeteries(fc([feature({ coords: [WESTMINSTER.lng, WESTMINSTER.lat] })])),
    ).toEqual([]);
  });

  it("drops nameless and geometry-less rows, never guessed", () => {
    expect(normalizeCemeteries(fc([feature({ props: { Name: "  " } })]))).toEqual([]);
    expect(normalizeCemeteries(fc([feature({ coords: null })]))).toEqual([]);
    expect(normalizeCemeteries(fc([feature({ type: "Polygon" })]))).toEqual([]);
  });

  it("omits an empty PlaceName and dedupes repeated FIDs", () => {
    const rows = normalizeCemeteries(
      fc([feature({ props: { PlaceName: "" } }), feature({})]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].place).toBeUndefined();
  });

  it("returns [] on junk input", () => {
    expect(normalizeCemeteries(null)).toEqual([]);
    expect(normalizeCemeteries({})).toEqual([]);
    expect(normalizeCemeteries({ features: "nope" })).toEqual([]);
  });
});
