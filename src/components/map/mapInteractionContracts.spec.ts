import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("map interaction state contracts", () => {
  it("uses the shared geolocation request instead of a private map request", () => {
    const source = readFileSync("src/components/map/AppMap.tsx", "utf8");

    expect(source).toContain("requestHighAccuracy: requestSharedGeolocation");
    expect(source).toContain("requestSharedGeolocation()");
    expect(source).toContain("GEOLOCATION_CHANGE_EVENT");
    expect(source).not.toContain("navigator.geolocation.getCurrentPosition");
  });

  it("uses auth-aware place follows in the compact map card", () => {
    const source = readFileSync("src/components/map/MapPeek.tsx", "utf8");

    expect(source).toContain("useIsFollowed(place.slug)");
    expect(source).toContain('useToggleFollow(place.slug, "map_peek")');
    expect(source).not.toContain('useToggleSave("place"');
    expect(source).not.toContain('useIsSaved("place"');
  });

  it("clears a cached map search when the route no longer has q", () => {
    const source = readFileSync("src/components/map/AppMap.tsx", "utf8");

    expect(source).toContain(
      "setQ((current) => (current === routeQuery ? current : routeQuery));",
    );
    expect(source).not.toContain("if (!routeQuery) return;");
  });

  it("uses category artwork instead of unattributed remote event photos on pins", () => {
    const mapSource = readFileSync("src/components/map/AppMap.tsx", "utf8");
    const pageSource = readFileSync("src/app/(app)/map/page.tsx", "utf8");
    const typeSource = readFileSync("src/components/map/types.ts", "utf8");

    expect(mapSource).toContain("<CategoryIcon");
    expect(mapSource).toContain("slug={lead.category}");
    expect(mapSource).not.toContain("lead.hero_image");
    expect(pageSource).not.toContain("hero_image: e.hero_image");
    expect(typeSource).not.toContain("hero_image?: string;");
  });
});
