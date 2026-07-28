import { describe, expect, it } from "vitest";
import { mapPopupSource } from "./mapPopupSource";

describe("mapPopupSource", () => {
  it("keeps official river gauges tied to the exact USGS station", () => {
    expect(mapPopupSource("usgs:01643000")).toEqual({
      kind: "usgs",
      label: "U.S. Geological Survey",
      href: "https://waterdata.usgs.gov/monitoring-location/01643000/",
    });
  });

  it("does not mislabel Maryland charging data as OpenStreetMap", () => {
    expect(mapPopupSource("mdev:charging-12")).toEqual({
      kind: "maryland-imap",
      label: "Maryland iMAP",
      href: "https://data.imap.maryland.gov/",
    });
  });

  it.each([
    ["bench-n-4173183053", "https://www.openstreetmap.org/node/4173183053"],
    ["ev_charging-node-8664305062", "https://www.openstreetmap.org/node/8664305062"],
    ["way/1234", "https://www.openstreetmap.org/way/1234"],
  ])("builds a valid OSM object link for %s", (id, href) => {
    expect(mapPopupSource(id).href).toBe(href);
  });

  it("falls back to OSM attribution when an object id cannot be decoded", () => {
    expect(mapPopupSource("unknown").href).toBe(
      "https://www.openstreetmap.org/copyright",
    );
  });
});
