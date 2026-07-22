import { describe, it, expect } from "vitest";
import { OVERLAYS, parseLayersParam, serializeLayers } from "@/lib/overlays";

/**
 * Overlay registry + URL state (6.3, 6.4). The map opens clean (nothing
 * active by default is a render concern), the overlays are the single
 * source of truth, and the ?layers= round-trip is stable and tamper-safe
 * so a shared view restores exactly and a junk URL toggles nothing.
 *
 * Trails and cemeteries are deliberately NOT overlays: they ship as live
 * map layers with their own counts, so listing them here too printed a
 * duplicate (and a "soon" placeholder) in the Layers tab.
 */
describe("overlay registry", () => {
  it("defines exactly the GIS overlays with no live-layer twin", () => {
    expect(OVERLAYS.map((o) => o.key).sort()).toEqual(
      ["art", "bridges", "markets", "parks"],
    );
  });

  it("has no duplicate trails or cemeteries overlay (they are live layers)", () => {
    const keys = OVERLAYS.map((o) => o.key);
    expect(keys).not.toContain("trails");
    expect(keys).not.toContain("historic");
  });

  it("every listed overlay is seeded and ready", () => {
    const ready = OVERLAYS.filter((o) => o.ready).map((o) => o.key).sort();
    expect(ready).toEqual(["bridges", "markets", "parks"]);
  });
});

describe("parseLayersParam", () => {
  it("parses a comma list and drops unknown keys", () => {
    expect(parseLayersParam("art,parks")).toEqual(["art", "parks"]);
    expect(parseLayersParam("art,phantom,bridges")).toEqual(["art", "bridges"]);
    // Retired keys no longer toggle a layer from a stale shared URL.
    expect(parseLayersParam("art,historic,trails")).toEqual(["art"]);
  });

  it("is whitespace and case tolerant, dedupes, and handles empty", () => {
    expect(parseLayersParam(" ART , art , Parks ")).toEqual(["art", "parks"]);
    expect(parseLayersParam("")).toEqual([]);
    expect(parseLayersParam(null)).toEqual([]);
  });
});

describe("serializeLayers", () => {
  it("round-trips in stable registry order", () => {
    // Output follows registry order (parks, art, markets, bridges),
    // regardless of input order, so a shared URL is canonical.
    expect(serializeLayers(["art", "parks"])).toBe("parks,art");
    expect(serializeLayers(["parks", "art"])).toBe("parks,art");
    expect(parseLayersParam(serializeLayers(["bridges", "art"]))).toEqual(["art", "bridges"]);
    expect(serializeLayers(["bridges", "parks"])).toBe("parks,bridges");
  });

  it("is empty when nothing is active, so the param drops from the URL", () => {
    expect(serializeLayers([])).toBe("");
  });
});
