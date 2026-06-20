import { describe, it, expect } from "vitest";
import places from "@/data/places-client.json" with { type: "json" };
import overrides from "@/data/places-overrides.json" with { type: "json" };
import fieldNotes from "@/data/field-notes.json" with { type: "json" };

/**
 * Data-health guard — locks the invariants the 2026-06-20 all-business audit
 * (workflow wwvolblmx) verified clean or fixed, so the next enrichment/scrape
 * re-run can't silently re-introduce a known bug class. Runs on every change to
 * places-client.json. NOT yet asserted here (known backlog, tracked separately):
 * the 50 phantom shared-Google-data groups, the 952 empty postal_codes, and the
 * 3 inverted-hours typos — add those once each is driven to zero.
 */

type Place = {
  slug: string;
  municipality?: string;
  state?: string;
  google_rating?: number;
  google_rating_count?: number;
};

const PLACES = places as unknown as Place[];
const slugs = new Set(PLACES.map((p) => p.slug));

// The 12 incorporated municipalities + Urbana (the canonical vocab). Anything
// else silently drops from every municipality-keyed filter and town page.
const VALID_MUNI = new Set([
  "frederick", "brunswick", "thurmont", "middletown", "walkersville",
  "emmitsburg", "new-market", "mount-airy", "myersville", "woodsboro",
  "burkittsville", "rosemont", "urbana",
]);

describe("places-client data health", () => {
  it("has no duplicate slugs", () => {
    expect(slugs.size).toBe(PLACES.length);
  });

  it("tags every place with a valid municipality slug (or none)", () => {
    const bad = PLACES.filter((p) => p.municipality && !VALID_MUNI.has(p.municipality));
    expect(bad.map((p) => `${p.slug} -> ${p.municipality}`)).toEqual([]);
  });

  it("keeps google_rating in [0,5] and rating_count a non-negative integer", () => {
    const bad = PLACES.filter(
      (p) =>
        (p.google_rating != null && (p.google_rating < 0 || p.google_rating > 5)) ||
        (p.google_rating_count != null && (p.google_rating_count < 0 || !Number.isInteger(p.google_rating_count))),
    );
    expect(bad.map((p) => p.slug)).toEqual([]);
  });

  it("has no non-Maryland leak", () => {
    const ok = new Set(["MD", "Maryland", "md", undefined, ""]);
    const bad = PLACES.filter((p) => p.state != null && !ok.has(p.state));
    expect(bad.map((p) => `${p.slug} -> ${p.state}`)).toEqual([]);
  });
});

describe("places-overrides referential integrity", () => {
  const ov = overrides as { patch?: Record<string, unknown> };

  it("every patch key resolves to a live place (no stale orphans)", () => {
    const orphans = Object.keys(ov.patch ?? {}).filter((s) => !slugs.has(s));
    expect(orphans).toEqual([]);
  });
});

describe("field-notes referential integrity", () => {
  it("every field-note key resolves to a live place", () => {
    const orphans = Object.keys(fieldNotes as Record<string, unknown>).filter((s) => !slugs.has(s));
    expect(orphans).toEqual([]);
  });
});
