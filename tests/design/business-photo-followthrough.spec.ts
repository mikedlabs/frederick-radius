import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("business photo follow-through", () => {
  it("keeps every reserve row connected to its place media", () => {
    const source = read("src/app/(app)/reserve/page.tsx");

    expect(source).toContain("<PlaceMedallion place={p} size={44} />");
  });

  it("gives directory and source-only brunch spots an identity visual", () => {
    const source = read("src/app/(app)/brunch/page.tsx");

    expect(source).toContain("<PlaceMedallion place={place} size={44} />");
    expect(source).toContain('data-place-media="fallback"');
    expect(source).toContain("<BrunchIdentity spot={s} />");
  });

  it("carries the next happy-hour venue photo into its card", () => {
    const source = read("src/components/today/HappyHourWallet.tsx");

    expect(source).toContain("photo: p.google_photo_url");
    expect(source).toContain("google_photo_url: next.photo");
    expect(source).toContain("size={64}");
  });

  it("resolves each seasonal Today pool to its catalog photo or category fallback", () => {
    const source = read("src/components/today/PoolsToday.tsx");

    expect(source).toContain("clientPlaceBySlug(p.slug)");
    expect(source).toContain("<PlaceMedallion");
    expect(source).toContain("place={place ?? {");
    expect(source).toContain("size={44}");
  });

  it("keeps a category fallback on every final itinerary stop", () => {
    const source = read("src/components/plan/PlanBuilder.tsx");

    expect(source).toContain("const fallbackPlace = {");
    expect(source).toContain("!stop.photo_url &&");
    expect(source).toContain("place={fallbackPlace}");
    expect(source).toContain("size={80}");
  });
});
