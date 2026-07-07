import { describe, it, expect } from "vitest";
import { isSuspectBinding } from "./enrichmentBinding";
import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
// The composed base set — curated SEED places + the DFP scrape + discovery.
// The raw JSON files alone miss the hand-authored seeds (tabu-frederick,
// el-rancho-frederick, acacia-house-frederick are all seeds — and all three
// were wrong-business bindings).
import { PLACES } from "@/data/places";

type Ov = {
  fold?: Record<string, string>;
  remove?: string[];
  patch?: Record<string, { clearEnrichment?: boolean }>;
};

describe("isSuspectBinding", () => {
  it("flags a genuinely different business", () => {
    expect(isSuspectBinding("Tabu", "Law Office of Tara Shoemaker Esq. LLC")).toBe(true);
    expect(isSuspectBinding("South Market Creamery", "Bentztown")).toBe(true);
  });

  it("clears possessive / rename variants of the same business", () => {
    expect(isSuspectBinding("Bushwaller Irish Pub", "Bushwaller's")).toBe(false);
    expect(isSuspectBinding("Firestone Restaurant", "Firestone's Culinary Tavern")).toBe(false);
    expect(isSuspectBinding("Crystallume Medspa", "Crystal Lume Medical Spa")).toBe(false);
  });

  it("never flags address-style display names", () => {
    expect(isSuspectBinding("Cunningham Falls State Park", "14039 Catoctin Hollow Rd")).toBe(false);
  });
});

describe("data health: quarantine keys resolve to real base records", () => {
  // The public-set integrity checks (tests/places-data-health.spec.ts) exempt
  // quarantined slugs — a quarantine intentionally hides its record — so the
  // typo net for those keys lives HERE, against the base data files.
  it("every clearEnrichment key exists in the base place data", () => {
    const ov = OVERRIDES_RAW as Ov;
    const baseSlugs = new Set(PLACES.map((p) => p.slug));
    const typos = Object.entries(ov.patch ?? {})
      .filter(([, p]) => p.clearEnrichment)
      .map(([slug]) => slug)
      .filter((slug) => !baseSlugs.has(slug));
    expect(typos).toEqual([]);
  });
});

describe("data health: every suspect enrichment binding is quarantined or dead", () => {
  it("no live place carries another business's Google listing", () => {
    const enrichment = ENRICHMENT_RAW as Record<string, { display_name?: string }>;
    const ov = OVERRIDES_RAW as Ov;
    const dead = new Set([...(ov.remove ?? []), ...Object.keys(ov.fold ?? {})]);
    const quarantined = new Set(
      Object.entries(ov.patch ?? {})
        .filter(([, p]) => p.clearEnrichment)
        .map(([slug]) => slug),
    );
    const nameBySlug = new Map<string, string>(PLACES.map((p) => [p.slug, p.name]));

    const offenders: string[] = [];
    for (const [slug, e] of Object.entries(enrichment)) {
      if (dead.has(slug) || quarantined.has(slug)) continue;
      const name = nameBySlug.get(slug);
      if (!name || !e.display_name) continue;
      if (isSuspectBinding(name, e.display_name)) {
        offenders.push(`${slug} ("${name}" bound to "${e.display_name}")`);
      }
    }
    // If this fails after an enrichment run: eyeball each offender — if the
    // Google listing really is a different business, add a clearEnrichment
    // patch in places-overrides.json; if it's a rename of the same business,
    // teach isSuspectBinding the pattern instead of loosening blindly.
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
