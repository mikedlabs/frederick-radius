import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = postcss.parse(readFileSync("src/app/globals.css", "utf8"));

/** Top-level declarations for one selector, so a phone-only block cannot satisfy the check. */
function everywhere(selector: string): Map<string, string> {
  const found = new Map<string, string>();
  stylesheet.walkRules((rule) => {
    if (rule.parent?.type !== "root") return;
    if (!rule.selector.split(",").some((part) => part.trim() === selector)) return;
    rule.walkDecls((entry) => { found.set(entry.prop, `${entry.value}${entry.important ? " !important" : ""}`); });
  });
  return found;
}

describe("map attribution info button", () => {
  it("draws the Mapbox glyph once in the 44px target at every width", () => {
    // Mapbox ships a 24px background for a 24px button. The 44px target
    // repeated it four times on desktop, where no narrower rule centered it.
    const mapbox = everywhere(".mapboxgl-map .mapboxgl-ctrl-attrib-button");
    expect(mapbox.get("width")).toBe("44px !important");
    expect(mapbox.get("height")).toBe("44px !important");
    expect(mapbox.get("background-position")).toBe("center !important");
    expect(mapbox.get("background-repeat")).toBe("no-repeat !important");
  });

  it("matches the MapLibre button, which already centered its glyph", () => {
    const maplibre = everywhere(".maplibregl-map .maplibregl-ctrl-attrib-button");
    const mapbox = everywhere(".mapboxgl-map .mapboxgl-ctrl-attrib-button");
    for (const property of ["background-position", "background-repeat"]) {
      expect(mapbox.get(property), property).toBe(maplibre.get(property));
    }
  });
});
