// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import COUNTY from "@/data/county-boundary.json";
import { MUNICIPALITIES } from "@/data/municipalities";
import CountyLocator, { type LocatorArea } from "./CountyLocator";

function diagram(area: LocatorArea = {}) {
  return new DOMParser().parseFromString(renderToStaticMarkup(<CountyLocator {...area} />), "text/html");
}

describe("offline county locator", () => {
  it("plots the committed Census polygon and every town in the same north-up local projection", () => {
    const doc = diagram();
    const ring = COUNTY.coordinates[0];
    const path = doc.querySelector("svg > path")!.getAttribute("d")!;
    const vertices = [...path.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(vertices).toHaveLength(ring.length);
    const west = Math.min(...ring.map(([x]) => x)), east = Math.max(...ring.map(([x]) => x));
    const south = Math.min(...ring.map(([, y]) => y)), north = Math.max(...ring.map(([, y]) => y));
    const scale = 211 / (north - south), mid = (south + north) / 2;
    function coordinates(lng: number, lat: number) {
      return [174 + (lng - (west + east) / 2) * scale * Math.cos(mid * Math.PI / 180), 125 - (lat - mid) * scale];
    }
    ring.forEach(([lng, lat], i) => {
      const [x, y] = coordinates(lng, lat);
      expect(vertices[i][0]).toBeCloseTo(x, 1);
      expect(vertices[i][1]).toBeCloseTo(y, 1);
    });
    const townDots = [...doc.querySelectorAll("svg > g[transform]")].filter((g) => g.querySelector("circle"));
    expect(townDots).toHaveLength(MUNICIPALITIES.length);
    MUNICIPALITIES.forEach((town, i) => {
      const [x, y] = coordinates(town.centroid.lng, town.centroid.lat);
      const pair = townDots[i].getAttribute("transform")!.match(/[\d.-]+/g)!.map(Number);
      expect(pair[0]).toBeCloseTo(x, 1); expect(pair[1]).toBeCloseTo(y, 1);
    });
    expect(doc.querySelector("[data-locator-selection]")).toBeNull();
    expect(doc.querySelector("svg")?.getAttribute("role")).toBe("img");
  });

  it("distinguishes a town center from a selected point and never pins an unknown location", () => {
    const town = diagram({ town: "myersville" });
    expect(town.querySelector("figcaption")?.textContent).toContain("Town center: Myersville");
    const townPosition = town.querySelector('[data-locator-selection="Town center"]')!.getAttribute("transform");
    const place = diagram({ town: "myersville", point: { lng: -77.626, lat: 39.313, label: "Chosen place", kind: "Selected place" } });
    expect(place.querySelector("figcaption")?.textContent).toContain("Selected place: Chosen place");
    expect(place.querySelector('[data-locator-selection="Selected place"]')!.getAttribute("transform")).not.toBe(townPosition);
    expect(diagram({ town: "unknown" }).querySelector("[data-locator-selection]")).toBeNull();
    const outside = diagram({ point: { lng: -82, lat: 40, label: "Your location", kind: "Starting point" } });
    expect(outside.querySelector("[data-locator-selection]")).toBeNull();
    expect(outside.querySelector("desc")?.textContent).toContain("outside this view");
  });
});
