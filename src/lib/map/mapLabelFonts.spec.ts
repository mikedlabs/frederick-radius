import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAP_LABEL_FONT_MEDIUM,
  MAP_LABEL_FONT_REGULAR,
} from "@/lib/map/frederickFlavorStyle";

/**
 * The map's label fonts have to agree with the glyphs we actually vendor,
 * and nothing at runtime enforces that.
 *
 * MapLibre answers a missing glyph range with a console warning and a local
 * browser font, so a wrong `text-font` produces labels that are subtly off in
 * weight and spacing rather than labels that are absent. The MapLibre swap hit
 * exactly that: layers carried Mapbox's "DIN Pro Medium", and several carried
 * nothing at all and inherited the spec default of "Open Sans Regular", so
 * every app label on /map fell back to local rendering while the map otherwise
 * looked fine.
 *
 * Two halves, because either one alone still lets the bug back in:
 *   1. Every stack the code names is one scripts/fetch-basemap.mjs downloads.
 *   2. Every symbol layer names a stack, since silence means Open Sans.
 */

const ROOT = join(__dirname, "..", "..", "..");

const SYMBOL_LAYER_SOURCES = [
  "src/components/map/AppMap.tsx",
  "src/components/map/MapDiscoveryOverlay.tsx",
  "src/components/radius/RadiusMap.tsx",
  "src/components/transit/TransitMap.tsx",
];

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

describe("map label fonts", () => {
  it("names only stacks the basemap fetch vendors", () => {
    const script = read("scripts/fetch-basemap.mjs");
    const declared = script.match(/const FONT_STACKS = \[([^\]]*)\]/);
    expect(declared, "FONT_STACKS not found in scripts/fetch-basemap.mjs").toBeTruthy();
    const vendored = new Set(
      [...declared![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    );

    for (const stack of [...MAP_LABEL_FONT_MEDIUM, ...MAP_LABEL_FONT_REGULAR]) {
      expect(
        vendored.has(stack),
        `text-font "${stack}" has no glyphs under /basemap/fonts — ` +
          `add it to FONT_STACKS or use a vendored stack`,
      ).toBe(true);
    }
  });

  it("gives every symbol layer an explicit text-font", () => {
    for (const relative of SYMBOL_LAYER_SOURCES) {
      const source = read(relative);
      const fields = source.match(/"text-field"/g)?.length ?? 0;
      const fonts = source.match(/"text-font"/g)?.length ?? 0;
      expect(fields, `${relative} should declare at least one label layer`).toBeGreaterThan(0);
      expect(
        fonts,
        `${relative} has ${fields} "text-field" layer(s) but ${fonts} "text-font" ` +
          `declaration(s); a layer without one silently falls back to Open Sans`,
      ).toBe(fields);
    }
  });

  it("names no Mapbox-hosted font stack anywhere", () => {
    for (const relative of SYMBOL_LAYER_SOURCES) {
      const source = read(relative);
      expect(source, `${relative} still names a Mapbox font stack`).not.toMatch(
        /DIN Pro|Arial Unicode MS|Open Sans/,
      );
    }
  });
});
