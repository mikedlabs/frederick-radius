import { describe, it, expect } from "vitest";
import { qualifiedSearchIndex, searchIndex } from "@/lib/search/index";
import { qualifiedSearch } from "@/lib/search";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * One-search exposes only reviewed, licensed map layers. Former transformed
 * County GIS copies stay out of search until their exact reuse scope is clear.
 */
describe("searchIndex map-layer results", () => {
  it("does not offer the retired markets overlay for a farmers-market query", () => {
    const results = searchIndex("farmers market", 8);
    expect(results.some((result) => result.id === "layer:markets")).toBe(false);
  });

  it("does not revive retired bridges or historic overlays", () => {
    expect(searchIndex("covered bridge", 8).some((r) => r.id === "layer:bridges")).toBe(false);
    expect(searchIndex("local history", 8).some((r) => r.id === "layer:historic")).toBe(false);
    expect(searchIndex("cemeteries", 8).some((r) => r.id === "layer:historic")).toBe(false);
  });

  it("does not offer a layer for an unrelated query", () => {
    const results = searchIndex("pizza", 8);
    expect(results.some((r) => r.id.startsWith("layer:"))).toBe(false);
  });

  it("never offers a coming-soon (not ready) layer", () => {
    // Public art has no reviewed entries yet; typing its keyword must not
    // toggle an empty overlay.
    const results = searchIndex("mural", 8);
    expect(results.some((r) => r.id === "layer:art")).toBe(false);
  });

  it("routes parks through the reviewed place index", () => {
    expect(qualifiedSearchIndex("local history", 8).results.some((r) => r.id === "layer:historic")).toBe(false);
    expect(qualifiedSearchIndex("parks", 8).results[0]).toMatchObject({
      id: "action:map-parks",
      href: "/map?intent=outdoor&sub=parks",
    });
  });

  it("preserves location-aware ranking for an ordinary query", () => {
    const context = {
      origin: FREDERICK_CENTER,
      contextLabel: "Downtown Frederick",
    };
    const core = qualifiedSearch("bakery", 8, undefined, context).hits;
    const firstCorePlace = core.find((hit) => hit.type === "place");
    const adapted = qualifiedSearchIndex("bakery", 8, undefined, context).results;
    const firstAdaptedPlace = adapted.find((result) => result.type === "place");

    expect(firstCorePlace?.type).toBe("place");
    expect(firstAdaptedPlace?.id).toBe(
      firstCorePlace?.type === "place" ? `place:${firstCorePlace.place.slug}` : undefined,
    );
  });
});
