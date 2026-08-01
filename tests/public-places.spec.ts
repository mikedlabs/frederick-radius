import { describe, it, expect } from "vitest";
import {
  canonicalBusinessStatusRefreshCandidates,
  publicPlaces,
  radiusPlaces,
  publicPlaceBySlug,
  publicPlacesByMunicipality,
  isOperational,
} from "@/lib/loaders/places";
import { PLACES } from "@/data/places";
import { isKnownClosed } from "@/lib/integrations/closures";
import { MANUAL_PLACE_STATUS_OVERRIDES } from "@/lib/place-status-overrides";
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

describe("canonicalBusinessStatusRefreshCandidates", () => {
  const providerClosedSlug = "mon-bon-croissant";

  it("keeps a provider-hidden closure eligible for reopening checks", () => {
    const place = PLACES.find((row) => row.slug === providerClosedSlug);
    expect(place).toBeDefined();
    expect(isOperational(place!)).toBe(false);
    expect(publicPlaces().some((row) => row.slug === providerClosedSlug)).toBe(
      false,
    );
    expect(
      canonicalBusinessStatusRefreshCandidates().some(
        (row) => row.slug === providerClosedSlug,
      ),
    ).toBe(true);
  });

  it("keeps a reviewed operational correction public and eligible for recheck", () => {
    const place = PLACES.find((row) => row.slug === providerClosedSlug);
    expect(place).toBeDefined();
    const previous = MANUAL_PLACE_STATUS_OVERRIDES[providerClosedSlug];
    MANUAL_PLACE_STATUS_OVERRIDES[providerClosedSlug] = {
      status: "operational",
      effective_at: "2026-07-26",
      review_after: "2099-08-02",
      source: "https://example.com/official-location",
      note: "Test-only first-party operational correction.",
    };
    try {
      expect(isOperational(place!)).toBe(true);
      expect(publicPlaceBySlug(providerClosedSlug)).toBeDefined();
      expect(
        canonicalBusinessStatusRefreshCandidates().some(
          (row) => row.slug === providerClosedSlug,
        ),
      ).toBe(true);
    } finally {
      if (previous) {
        MANUAL_PLACE_STATUS_OVERRIDES[providerClosedSlug] = previous;
      } else {
        delete MANUAL_PLACE_STATUS_OVERRIDES[providerClosedSlug];
      }
    }
  });

  it("excludes manual safety closures and the known-closed denylist", () => {
    const previous = MANUAL_PLACE_STATUS_OVERRIDES[providerClosedSlug];
    MANUAL_PLACE_STATUS_OVERRIDES[providerClosedSlug] = {
      status: "closed_temporarily",
      effective_at: "2026-07-26",
      review_after: "2026-08-02",
      source: "https://example.com/official-closure",
      note: "Test-only safety closure.",
    };
    try {
      expect(
        canonicalBusinessStatusRefreshCandidates().some(
          (row) => row.slug === providerClosedSlug,
        ),
      ).toBe(false);
    } finally {
      if (previous) {
        MANUAL_PLACE_STATUS_OVERRIDES[providerClosedSlug] = previous;
      } else {
        delete MANUAL_PLACE_STATUS_OVERRIDES[providerClosedSlug];
      }
    }

    const candidateSlugs = new Set(
      canonicalBusinessStatusRefreshCandidates().map((row) => row.slug),
    );
    expect(candidateSlugs.has("the-cozy-creamery-thurmont")).toBe(false);
    for (const place of PLACES.filter((row) => isKnownClosed(row.name))) {
      expect(candidateSlugs.has(place.slug)).toBe(false);
    }
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
