import { describe, it, expect } from "vitest";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { placeReasons } from "@/lib/place-reasons";
import { HIDDEN_GEM_SLUGS } from "@/data/hidden-gems";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * Coverage: the 8 hand-curated hidden gems were collected (hidden-gems.ts)
 * but never reached a screen — the `hidden_gem` field was documented yet
 * never set, and no chip surfaced it. This wires it: the field is
 * populated through the loader and a "Hidden gem" reason chip appears
 * (high enough priority to survive the 3-chip cap).
 */
const bySlug = new Map(publicPlaces().map((p) => [p.slug, p]));

describe("hidden gems are lit up", () => {
  it("every curated gem is present in the public set", () => {
    for (const slug of HIDDEN_GEM_SLUGS) {
      expect(bySlug.has(slug), `${slug} missing from public places`).toBe(true);
    }
  });

  it("each gem carries hidden_gem=true and a 'Hidden gem' chip", () => {
    for (const slug of HIDDEN_GEM_SLUGS) {
      const p = bySlug.get(slug)!;
      const dp = decoratePlace(p, FREDERICK_CENTER);
      expect((dp as { hidden_gem?: boolean }).hidden_gem).toBe(true);
      const labels = placeReasons(dp).map((c) => c.label);
      expect(labels).toContain("Hidden gem");
    }
  });

  it("a non-gem place does not get the chip", () => {
    const nonGem = publicPlaces().find((p) => !HIDDEN_GEM_SLUGS.has(p.slug));
    expect(nonGem).toBeTruthy();
    const dp = decoratePlace(nonGem!, FREDERICK_CENTER);
    expect((dp as { hidden_gem?: boolean }).hidden_gem).toBe(false);
    expect(placeReasons(dp).map((c) => c.label)).not.toContain("Hidden gem");
  });
});
