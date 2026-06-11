import { describe, it, expect } from "vitest";
import { OVERLAYS, parseLayersParam, serializeLayers } from "@/lib/overlays";

/**
 * Overlay registry + URL state (6.3, 6.4). The map opens clean (nothing
 * active by default is a render concern), the six overlays are the
 * single source of truth, and the ?layers= round-trip is stable and
 * tamper-safe so a shared view restores exactly and a junk URL toggles
 * nothing.
 */
describe("overlay registry", () => {
  it("defines exactly the six brief overlays", () => {
    expect(OVERLAYS.map((o) => o.key).sort()).toEqual(
      ["art", "bridges", "historic", "markets", "parks", "trails"],
    );
  });

  it("the seeded layers are public art and the GIS pulls (parks, markets, bridges)", () => {
    const ready = OVERLAYS.filter((o) => o.ready).map((o) => o.key).sort();
    expect(ready).toEqual(["art", "bridges", "markets", "parks"]);
  });
});

describe("parseLayersParam", () => {
  it("parses a comma list and drops unknown keys", () => {
    expect(parseLayersParam("art,historic")).toEqual(["art", "historic"]);
    expect(parseLayersParam("art,phantom,bridges")).toEqual(["art", "bridges"]);
  });

  it("is whitespace and case tolerant, dedupes, and handles empty", () => {
    expect(parseLayersParam(" ART , art , Historic ")).toEqual(["art", "historic"]);
    expect(parseLayersParam("")).toEqual([]);
    expect(parseLayersParam(null)).toEqual([]);
  });
});

describe("serializeLayers", () => {
  it("round-trips in stable registry order", () => {
    // Output follows registry order (trails, parks, historic, art, ...),
    // regardless of input order, so a shared URL is canonical.
    expect(serializeLayers(["art", "historic"])).toBe("historic,art");
    expect(serializeLayers(["historic", "art"])).toBe("historic,art");
    expect(parseLayersParam(serializeLayers(["bridges", "art"]))).toEqual(["art", "bridges"]);
  });

  it("is empty when nothing is active, so the param drops from the URL", () => {
    expect(serializeLayers([])).toBe("");
  });
});
