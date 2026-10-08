import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The MapLibre canvas is a lazily imported client chunk. The server render
// only ever paints the placeholder and the pins, so a stand-in is enough.
vi.mock("next/dynamic", () => ({
  default: () => function MockOwnedMiniMapCanvas() {
    return createElement("div", { "data-test-canvas": "" });
  },
}));

import TonightMap, {
  TONIGHT_MAP_MAX_ROWS,
  tonightMapPlan,
  type TonightMapRow,
} from "./TonightMap";
import { miniMapPinsCamera } from "@/components/map/OwnedMiniMap";

// Real downtown venues: Weinberg Center, Steinhardt Brewing, Brewer's Alley,
// and New Spire Arts. Baker Park is the area-level row.
const weinberg: TonightMapRow = {
  key: "weinberg",
  name: "Las Áñez",
  geom: { lng: -77.4105, lat: 39.4146 },
  geo_confidence: "venue_match",
};
const steinhardt: TonightMapRow = {
  key: "steinhardt",
  name: "Bluegrass Jam",
  geom: { lng: -77.4089, lat: 39.4178 },
  geo_confidence: "venue_match",
};
const brewers: TonightMapRow = {
  key: "brewers",
  name: "Trivia Night",
  geom: { lng: -77.4106, lat: 39.4167 },
  geo_confidence: "exact_address",
};
const spire: TonightMapRow = {
  key: "spire",
  name: "Open Mic",
  geom: { lng: -77.4102, lat: 39.4131 },
  geo_confidence: "venue_match",
};
// Sits on the downtown feed default: listed, never pinned.
const areaOnly: TonightMapRow = {
  key: "area",
  name: "Downtown Art Walk",
  geom: { lng: -77.4109, lat: 39.4137 },
  geo_confidence: "area",
};
const noGeom: TonightMapRow = { key: "none", name: "County meeting" };

const pinLabels = (html: string, size: "compact" | "wide") => {
  const start = html.indexOf(`data-today-tonight-map="${size}"`);
  if (start < 0) return null;
  const end = html.indexOf("data-today-tonight-map=", start + 10);
  const chunk = html.slice(start, end < 0 ? undefined : end);
  return [...chunk.matchAll(/data-mini-map-pin="(\d+)"/g)].map((m) => m[1]);
};

describe("tonightMapPlan", () => {
  it("numbers only precisely located rows, in row order, without gaps", () => {
    const plan = tonightMapPlan([areaOnly, weinberg, noGeom, steinhardt, brewers]);
    expect([...plan.numbers.entries()]).toEqual([
      ["weinberg", "1"],
      ["steinhardt", "2"],
      ["brewers", "3"],
    ]);
    expect(plan.widePins.map((pin) => [pin.label, pin.name])).toEqual([
      ["1", "Las Áñez"],
      ["2", "Bluegrass Jam"],
      ["3", "Trivia Night"],
    ]);
    expect(plan.wide).toBe(true);
  });

  it("gives the phone map only the rows a phone shows, with the same numbers", () => {
    const plan = tonightMapPlan([weinberg, areaOnly, steinhardt, brewers, spire], 3);
    expect(plan.compactPins.map((pin) => pin.label)).toEqual(["1", "2"]);
    expect(plan.widePins.map((pin) => pin.label)).toEqual(["1", "2", "3", "4"]);
    expect(plan.numbers.get("steinhardt")).toBe("2");
    expect(plan.compact).toBe(true);
  });

  it("can draw the wide map when the phone's rows hold fewer than two pins", () => {
    const plan = tonightMapPlan([weinberg, areaOnly, noGeom, steinhardt, brewers], 3);
    expect(plan.compact).toBe(false);
    expect(plan.wide).toBe(true);
    expect(plan.numbers.get("weinberg")).toBe("1");
  });

  it("reads at most five rows", () => {
    const rows = [weinberg, steinhardt, brewers, spire, areaOnly, { ...spire, key: "sixth" }];
    const plan = tonightMapPlan(rows);
    expect(TONIGHT_MAP_MAX_ROWS).toBe(5);
    expect(plan.numbers.has("sixth")).toBe(false);
    expect(plan.widePins).toHaveLength(4);
  });

  it("numbers nothing when fewer than two rows are precise", () => {
    const plan = tonightMapPlan([weinberg, areaOnly, noGeom]);
    expect(plan.compact).toBe(false);
    expect(plan.wide).toBe(false);
    expect(plan.numbers.size).toBe(0);
  });

  it("does not trust an unstamped coordinate", () => {
    const unstamped: TonightMapRow = {
      key: "unstamped",
      name: "Legacy listing",
      geom: { lng: -77.42, lat: 39.42 },
    };
    expect(tonightMapPlan([unstamped, weinberg]).wide).toBe(false);
  });
});

describe("TonightMap", () => {
  it("renders nothing with fewer than two precise rows, so no empty frame is drawn", () => {
    expect(renderToStaticMarkup(<TonightMap rows={[weinberg, areaOnly]} name="tonight's events" />)).toBe("");
    expect(renderToStaticMarkup(<TonightMap rows={[]} name="tonight's events" />)).toBe("");
  });

  it("draws one phone map and one wide map whose pins match the row numbers", () => {
    const rows = [weinberg, areaOnly, steinhardt, brewers, spire];
    const html = renderToStaticMarkup(
      <TonightMap rows={rows} compactCount={3} name="tonight's events" />,
    );
    // Pins are painted last-first so pin 1 stays on top of a cluster.
    expect(pinLabels(html, "compact")).toEqual(["2", "1"]);
    expect(pinLabels(html, "wide")).toEqual(["4", "3", "2", "1"]);
    expect(html).toContain("Locations of tonight&#x27;s events: 1 Las Áñez, 2 Bluegrass Jam");
    // Exactly one instance shows per breakpoint.
    expect(html).toMatch(/data-today-tonight-map="compact" class="[^"]*\blg:hidden\b/);
    expect(html).toMatch(/data-today-tonight-map="wide" class="[^"]*\bhidden lg:block\b/);
    // Server render never mounts MapLibre.
    expect(html).not.toContain("data-test-canvas");
  });

  it("sizes the wide map at 300px and frames its pins for a 480px column", () => {
    const rows = [weinberg, steinhardt, brewers];
    const html = renderToStaticMarkup(<TonightMap rows={rows} name="today's events" />);
    const wide = html.slice(html.indexOf('data-today-tonight-map="wide"'));
    expect(wide).toContain("height:300px");
    const camera = miniMapPinsCamera(
      rows.map((row) => row.geom!),
      { width: 480, height: 300 },
    );
    const first = camera.offsets[0];
    expect(wide).toContain(`left:calc(50% + ${first.x}px)`);
    // The phone instance keeps the default 176px box.
    const compact = html.slice(0, html.indexOf('data-today-tonight-map="wide"'));
    expect(compact).toContain("h-44");
  });

  it("skips the phone map but keeps the wide one when only wide rows hold two pins", () => {
    const html = renderToStaticMarkup(
      <TonightMap
        rows={[weinberg, areaOnly, noGeom, steinhardt]}
        compactCount={3}
        name="tonight's events"
      />,
    );
    expect(pinLabels(html, "compact")).toBeNull();
    expect(pinLabels(html, "wide")).toEqual(["2", "1"]);
  });
});
