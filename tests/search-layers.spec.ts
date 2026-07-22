import { describe, it, expect } from "vitest";
import { qualifiedSearchIndex, searchIndex } from "@/lib/search/index";
import { qualifiedSearch } from "@/lib/search";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * One-search: typing what a map LAYER shows offers the layer itself, so
 * "farmers market" surfaces the overlay alongside the market places.
 * This is what lets the single map search answer layers, not just text.
 */
describe("searchIndex map-layer results", () => {
  it("offers the markets overlay for a farmers-market query", () => {
    const results = searchIndex("farmers market", 8);
    const layer = results.find((r) => r.id === "layer:markets");
    expect(layer, "expected a layer:markets result").toBeTruthy();
    expect(layer!.href).toBe("/map?mode=browse&layers=markets");
    expect(layer!.type).toBe("action");
  });

  it("offers covered bridges and public art for their keywords", () => {
    expect(searchIndex("covered bridge", 8).some((r) => r.id === "layer:bridges")).toBe(true);
    expect(searchIndex("mural", 8).some((r) => r.id === "layer:art")).toBe(true);
  });

  it("does not offer a layer for an unrelated query", () => {
    const results = searchIndex("pizza", 8);
    expect(results.some((r) => r.id.startsWith("layer:"))).toBe(false);
  });

  it("never offers a coming-soon (not ready) layer", () => {
    // Trails is not ready (federal NPS data); typing its keyword must
    // not toggle an empty overlay.
    const results = searchIndex("appalachian trail", 8);
    expect(results.some((r) => r.id === "layer:trails")).toBe(false);
  });

  it("keeps ready layer doors when the qualified adapter is used", () => {
    expect(qualifiedSearchIndex("mural", 8).results.some((r) => r.id === "layer:art")).toBe(true);
    expect(qualifiedSearchIndex("parks", 8).results.some((r) => r.id === "layer:parks")).toBe(true);
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
