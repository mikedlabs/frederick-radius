import { describe, expect, it } from "vitest";
import ENRICHMENT from "@/data/places-enrichment.json" with { type: "json" };
import { decoratePlace, publicPlaces } from "./places";

describe("place verification freshness", () => {
  it("uses the row's actual Google enrichment timestamp", () => {
    const enrichment = ENRICHMENT as Record<
      string,
      { enriched_at?: string }
    >;
    const place = publicPlaces().find(
      (candidate) => enrichment[candidate.slug]?.enriched_at,
    );
    expect(place).toBeDefined();

    const decorated = decoratePlace(place!);
    expect(decorated.last_verified_at).toBe(
      enrichment[place!.slug].enriched_at,
    );
  });
});
