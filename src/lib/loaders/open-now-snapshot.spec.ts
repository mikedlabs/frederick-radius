import { describe, expect, it } from "vitest";
import { betaOpenNowSnapshot } from "@/lib/loaders/betaPulse";
import {
  countOpenNow,
  getOpenNowSnapshot,
  openNowHighlights,
} from "@/lib/loaders/places";

const NOW = new Date("2026-07-29T14:00:00-04:00");
const NON_LEISURE_OFFENDERS = [
  "odin-crossfit",
  "artistangle-gallery",
  "ppr-strategies",
] as const;

describe("county open-now snapshot", () => {
  it("drives every county count from one untruncated population and instant", () => {
    const snapshot = getOpenNowSnapshot(NOW);
    const beta = betaOpenNowSnapshot(NOW);
    const compatibility = openNowHighlights(3, NOW);

    expect(snapshot.count).toBe(snapshot.places.length);
    expect(countOpenNow(NOW)).toBe(snapshot.count);
    expect(compatibility.count).toBe(snapshot.count);
    expect(beta.inventoryCount).toBe(snapshot.count);
    expect(snapshot.asOf).toBe(NOW.toISOString());
    expect(compatibility.asOf).toBe(snapshot.asOf);
    expect(beta.asOf).toBe(snapshot.asOf);
  });

  it("keeps non-leisure inventory searchable without promoting it as a pick", () => {
    const snapshot = getOpenNowSnapshot(NOW);
    const inventorySlugs = new Set(snapshot.places.map(({ slug }) => slug));
    const proofSlugs = new Set(
      snapshot.worthConsidering.map(({ slug }) => slug),
    );

    for (const slug of NON_LEISURE_OFFENDERS) {
      expect(inventorySlugs.has(slug), `${slug} should remain in inventory`).toBe(
        true,
      );
      expect(proofSlugs.has(slug), `${slug} must not become beta proof`).toBe(
        false,
      );
    }
  });

  it("selects a stable, module-diverse proof instead of three directory rows", () => {
    const first = getOpenNowSnapshot(NOW).worthConsidering;
    const second = getOpenNowSnapshot(NOW).worthConsidering;

    expect(second).toEqual(first);
    expect(first).toHaveLength(3);
    expect(new Set(first.map(({ module }) => module)).size).toBe(3);
  });
});
