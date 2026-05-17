import { describe, it, expect } from "vitest";
import {
  publicPlaces,
  radiusPlaces,
  publicPlaceBySlug,
  publicPlacesByMunicipality,
  isOperational,
} from "@/lib/loaders/places";
import { PLACES } from "@/data/places";
import { isKnownClosed } from "@/lib/integrations/closures";
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };

/**
 * P0-1 invariants: ONE canonical public place set. Every non-admin
 * surface (home, Map, Search, Municipality, Saved, Sitemap, Plan, event
 * detail) reads through these, so these assertions are the contract that
 * keeps every route showing the same reality. Dedupe asserts the
 * production default (RADIUS_DEDUPE unset == on).
 */
const DEDUP = DEDUP_RAW as Record<string, { canonical: string }>;
const slugsOf = (list: { slug: string }[]) => list.map((p) => p.slug);

describe("publicPlaces (canonical public set)", () => {
  it("is pure/deterministic — same slugs and length across calls", () => {
    const a = publicPlaces();
    const b = publicPlaces();
    expect(a.length).toBe(b.length);
    expect(slugsOf(a)).toEqual(slugsOf(b));
  });

  it("only ever shrinks the raw set (filter, never invent)", () => {
    expect(publicPlaces().length).toBeLessThanOrEqual(PLACES.length);
    expect(publicPlaces().length).toBeGreaterThan(0);
  });

  it("contains no closed records — every place is operational", () => {
    for (const p of publicPlaces()) {
      expect(isOperational(p)).toBe(true);
    }
  });

  it("excludes every known-closed business by slug", () => {
    const publicSlugs = new Set(slugsOf(publicPlaces()));
    const knownClosed = PLACES.filter((p) => isKnownClosed(p.name));
    // The closures override list is non-empty (VOLT, Idiom, etc.).
    expect(knownClosed.length).toBeGreaterThan(0);
    for (const p of knownClosed) {
      expect(publicSlugs.has(p.slug)).toBe(false);
      expect(publicPlaceBySlug(p.slug)).toBeUndefined();
    }
  });

  it("has no duplicate slugs and no folded-duplicate slugs (dedupe on)", () => {
    const slugs = slugsOf(publicPlaces());
    expect(new Set(slugs).size).toBe(slugs.length);
    const folded = Object.entries(DEDUP)
      .filter(([slug, v]) => v.canonical !== slug)
      .map(([slug]) => slug);
    const publicSet = new Set(slugs);
    for (const f of folded) expect(publicSet.has(f)).toBe(false);
  });

  it("radiusPlaces() is an exact back-compat alias of publicPlaces()", () => {
    expect(slugsOf(radiusPlaces())).toEqual(slugsOf(publicPlaces()));
  });
});

describe("publicPlaceBySlug (canonical resolve)", () => {
  it("returns undefined for an unknown slug", () => {
    expect(publicPlaceBySlug("definitely-not-a-real-place-xyz")).toBeUndefined();
  });

  it("resolves a folded slug to a live canonical (idempotent)", () => {
    let checked = 0;
    for (const [slug, v] of Object.entries(DEDUP)) {
      if (v.canonical === slug) continue; // not a fold
      const resolved = publicPlaceBySlug(slug);
      // The canonical may itself be closed; if so resolve is undefined.
      if (!resolved) continue;
      expect(resolved.slug).toBe(v.canonical);
      // The canonical is real, operational, and resolves idempotently.
      // We deliberately do NOT assert it is in publicPlaces(): the
      // relevance filter intentionally hides non-discoverable B2B
      // canonicals (a folded law firm, freight broker, …) from
      // discovery while keeping them directly resolvable so saved or
      // linked records never 404 — "hide from discovery, never destroy".
      expect(isOperational(resolved)).toBe(true);
      expect(publicPlaceBySlug(resolved.slug)?.slug).toBe(v.canonical);
      checked++;
    }
    // At least one fold must actually exercise the canonical path.
    expect(checked).toBeGreaterThan(0);
  });

  it("every public slug resolves back to itself", () => {
    for (const p of publicPlaces()) {
      expect(publicPlaceBySlug(p.slug)?.slug).toBe(p.slug);
    }
  });
});

describe("publicPlacesByMunicipality", () => {
  it("is exactly publicPlaces() filtered to the municipality", () => {
    const munis = new Set(publicPlaces().map((p) => p.municipality));
    for (const m of munis) {
      const expected = slugsOf(publicPlaces().filter((p) => p.municipality === m)).sort();
      const actual = slugsOf(publicPlacesByMunicipality(m)).sort();
      expect(actual).toEqual(expected);
    }
  });

  it("returns an empty list for a municipality with no public places", () => {
    expect(publicPlacesByMunicipality("__no_such_municipality__")).toEqual([]);
  });
});
