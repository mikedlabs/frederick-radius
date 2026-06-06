import { describe, it, expect } from "vitest";
import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { SUPPRESSED_JUNK_SLUGS } from "@/lib/relevance";

const ENR = ENRICHMENT_RAW as Record<string, { photo_names?: string[] }>;

describe("shared-photo de-twin (photo-twins pass)", () => {
  const pub = publicPlaces();

  it("no Google photo cluster (ChIJ) has more than one VISIBLE photo", () => {
    // Cluster by the first photo_name's ChIJ id, then count how many
    // records still render a hero photo AFTER suppression. The promise:
    // never two cards sharing the same photo.
    const visibleByCluster = new Map<string, string[]>();
    for (const p of pub) {
      const pn = ENR[p.slug]?.photo_names?.[0];
      const m = pn && /(ChIJ[A-Za-z0-9_-]+)/.exec(pn);
      if (!m) continue;
      const dec = decoratePlace(p);
      if (dec.google_photo_url) {
        const arr = visibleByCluster.get(m[1]) ?? [];
        arr.push(p.name);
        visibleByCluster.set(m[1], arr);
      }
    }
    const twins = [...visibleByCluster.entries()].filter(([, names]) => names.length > 1);
    expect(twins).toEqual([]);
  });

  it("junk records are removed from the public set (still tight)", () => {
    const slugs = new Set(pub.map((p) => p.slug));
    for (const junk of SUPPRESSED_JUNK_SLUGS) {
      expect(slugs.has(junk)).toBe(false);
    }
  });

  it("the three folds collapse alias → canonical (alias gone, canonical kept)", () => {
    const slugs = new Set(pub.map((p) => p.slug));
    const folds: [string, string][] = [
      ["new-york-new-york-hair-salon-and-day-spa", "new-york-new-york-hair-salon-spa"],
      ["serenity-tearoom", "serenity-tearoom-fine-dining"],
      ["holistic-family-medicine_dolma-johanison-lac", "holistic-family-medicine"],
    ];
    for (const [alias, canonical] of folds) {
      expect(slugs.has(alias)).toBe(false);
      expect(slugs.has(canonical)).toBe(true);
    }
  });

  it("keeps distinct venues SEPARATE (no over-dedupe — Rockwell stays two)", () => {
    const slugs = new Set(pub.map((p) => p.slug));
    // Two real Rockwell locations must both survive (photo suppressed, not folded).
    expect(slugs.has("rockwell-brewery-frederick")).toBe(true); // — Riverside
    expect(slugs.has("rockwell-brewery-frederick-2")).toBe(true); // original
  });
});
