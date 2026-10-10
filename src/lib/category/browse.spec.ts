import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  CATEGORY_CACHE_CONTROL,
  CATEGORY_INITIAL_PAGE_SIZE,
  buildCategoryPageModel,
  isBrowsableCategorySlug,
  resolveCategoryRankingContext,
} from "./browse";

describe("category browse model", () => {
  it("keeps the first HTML page bounded and cacheable", () => {
    expect(CATEGORY_INITIAL_PAGE_SIZE).toBe(32);
    expect(CATEGORY_CACHE_CONTROL).toBe(
      "public, s-maxage=600, stale-while-revalidate=86400",
    );
    expect(isBrowsableCategorySlug("food")).toBe(true);
    expect(isBrowsableCategorySlug("restroom")).toBe(false);
  });

  it("does not embed the rest of a hub category in the first page", () => {
    const model = buildCategoryPageModel(
      "food",
      resolveCategoryRankingContext(null, null),
    );

    expect(model).not.toBeNull();
    expect(model!.totalCount).toBeGreaterThan(CATEGORY_INITIAL_PAGE_SIZE);
    expect(model!.places).toHaveLength(CATEGORY_INITIAL_PAGE_SIZE);
    expect(model!.topPicks.length).toBeLessThanOrEqual(3);
    expect(model!.places[0]).not.toHaveProperty("google_photos");
    expect(model!.places[0]).not.toHaveProperty("description");
    expect(model!.places[0]).not.toHaveProperty("hours");
    expect(model!.places[0]).not.toHaveProperty("amenities");
  });

  it("pages from the same ranked set", () => {
    const ranking = resolveCategoryRankingContext(null, null);
    const first = buildCategoryPageModel("restaurant", ranking, {
      offset: 0,
      limit: 32,
    });
    const second = buildCategoryPageModel("restaurant", ranking, {
      offset: 32,
      limit: 32,
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.places[0]?.slug).not.toBe(second!.places[0]?.slug);
    expect(first!.totalCount).toBe(second!.totalCount);
  });

  it("applies an explicit town as a hard boundary", () => {
    const model = buildCategoryPageModel(
      "playground",
      resolveCategoryRankingContext("town:walkersville", "frederick"),
    );

    expect(model).not.toBeNull();
    expect(model!.filterMuni).toBe("walkersville");
    expect(model!.places.every((place) => place.municipality === "walkersville")).toBe(
      true,
    );
  });
});

describe("category browse client contract", () => {
  it("keeps the places loader out of the hydrated category island", () => {
    const live = readFileSync("src/components/category/CategoryLive.tsx", "utf8");
    const contract = readFileSync("src/lib/category/browse-contract.ts", "utf8");

    expect(live).toContain("@/lib/category/browse-contract");
    expect(live).toContain("CategoryLiveProvider");
    expect(live).toContain("CategoryLiveCount");
    expect(live).not.toContain("@/lib/category/browse\"");
    expect(live).not.toContain("@/lib/loaders/places");
    expect(contract).not.toContain("rankPlaces");
    expect(contract).toContain("import type { PlaceCardData } from \"@/lib/loaders/places\"");
  });
});
