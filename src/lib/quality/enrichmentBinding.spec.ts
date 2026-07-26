import { describe, it, expect } from "vitest";
import { isSuspectBinding } from "./enrichmentBinding";
import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
// The composed base set — curated SEED places + the DFP scrape + discovery.
// The raw JSON files alone miss the hand-authored seeds (tabu-frederick,
// el-rancho-frederick, acacia-house-frederick are all seeds — and all three
// were wrong-business bindings).
import { PLACES } from "@/data/places";
import { haversineMeters } from "@/lib/geo";
import { isGooglePlaceId } from "@/lib/provenance";

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

  it("does not strand an exact nearby match under a folded legacy slug", () => {
    type EnrichmentRow = {
      display_name?: string;
      lat?: number;
      lng?: number;
    };
    type ClientRow = {
      slug: string;
      name: string;
      geom: { lng: number; lat: number };
    };
    const enrichment = ENRICHMENT_RAW as Record<string, EnrichmentRow>;
    const clients = CLIENT_RAW as ClientRow[];
    const clientSlugs = new Set(clients.map((place) => place.slug));
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const clientsByName = new Map<string, ClientRow[]>();
    for (const place of clients) {
      const key = normalize(place.name);
      clientsByName.set(key, [...(clientsByName.get(key) ?? []), place]);
    }

    const stranded: string[] = [];
    for (const [legacySlug, row] of Object.entries(enrichment)) {
      if (
        clientSlugs.has(legacySlug) ||
        !row.display_name ||
        typeof row.lat !== "number" ||
        typeof row.lng !== "number"
      ) {
        continue;
      }
      for (const place of clientsByName.get(normalize(row.display_name)) ?? []) {
        if (
          enrichment[place.slug] ||
          haversineMeters(
            { lng: row.lng, lat: row.lat },
            place.geom,
          ) > 500
        ) {
          continue;
        }
        stranded.push(
          `${legacySlug} should be reviewed against ${place.slug} (${place.name})`,
        );
      }
    }

    // A stale alias is not harmless file bloat: it withholds the Google ID
    // from the refresh cron and every canonical recommendation surface.
    expect(stranded, stranded.join("\n")).toEqual([]);
  });

  it("publishes only provider-valid Google Place IDs", () => {
    const invalid = (
      CLIENT_RAW as Array<{
        slug: string;
        google_place_id?: string;
      }>
    )
      .filter(
        (place) =>
          place.google_place_id &&
          !isGooglePlaceId(place.google_place_id),
      )
      .map((place) => place.slug);

    expect(invalid, invalid.join("\n")).toEqual([]);
  });
});
