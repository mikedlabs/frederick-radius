import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PARKING_GARAGES } from "@/data/parking-garages";

/**
 * Every garage slug in parking-garages.ts builds a /places/<slug> link
 * on /parking. If a slug drifts from the canonical place record (as
 * happened when the Phase 2 rebuild normalized the garage slugs), the
 * link 404s silently. This guard fails the build the moment that drift
 * reappears.
 */
const places = JSON.parse(
  readFileSync("src/data/places-client.json", "utf8"),
) as Array<{ slug: string }>;
const slugSet = new Set(places.map((p) => p.slug));

describe("parking garage slugs resolve to real place records", () => {
  it("places-client.json parsed as a non-empty slug set", () => {
    expect(slugSet.size).toBeGreaterThan(100);
  });

  for (const g of PARKING_GARAGES) {
    it(`"${g.slug}" (${g.name}) exists in places data`, () => {
      expect(slugSet.has(g.slug)).toBe(true);
    });
  }
});
