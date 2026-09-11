import { describe, it, expect } from "vitest";
import { PLACES } from "@/data/places";
import { decoratePlace } from "@/lib/loaders/places";
import {
  stampPlaceProvenance,
  stampEventProvenance,
  PROVENANCE_FIELDS,
  PROVENANCE_BACKFILL_EPOCH,
} from "@/lib/provenance";
import { upcomingEvents } from "@/data/events";
import { getEventBySlug } from "@/lib/loaders/events";

/**
 * Phase 1 acceptance gate (data brief 4.1): 100 percent of place rows
 * carry all seven provenance fields once they pass the loader chokepoint.
 * This suite IS the gate; it runs on every deploy with the rest of the
 * tests, so a future data file or adapter that skips the stamper fails
 * the build instead of shipping unbadged rows.
 */
describe("place provenance (data brief 4.1)", () => {
  it("every row in the dataset carries all seven fields after decoration", () => {
    const missing: Record<string, string[]> = {};
    for (const raw of PLACES) {
      const row = decoratePlace(raw) as unknown as Record<string, unknown>;
      for (const f of PROVENANCE_FIELDS) {
        // source_url may be null, but the key must exist on the row.
        if (!(f in row) || row[f] === undefined) {
          (missing[raw.slug] ??= []).push(f);
        }
      }
    }
    expect(
      Object.keys(missing).length,
      `rows missing provenance fields: ${JSON.stringify(Object.entries(missing).slice(0, 5))}`,
    ).toBe(0);
  });

  it("confidence values stay inside the decision-record enum", () => {
    const allowed = new Set(["curated", "partner", "verified", "scraped"]);
    const seen = new Set<string>();
    for (const raw of PLACES) {
      const row = decoratePlace(raw);
      expect(allowed.has(row.confidence)).toBe(true);
      seen.add(row.confidence);
    }
    // The current dataset spans curated, verified publisher/API rows, and the
    // discovery tail. Partner remains reserved for documented relationships.
    expect(seen.has("curated")).toBe(true);
    expect(seen.has("partner")).toBe(false);
    expect(seen.has("verified")).toBe(true);
    expect(seen.has("scraped")).toBe(true);
  });

  it("maps each source to its trust tier", () => {
    expect(stampPlaceProvenance({ slug: "x", source: "seed" }).confidence).toBe("curated");
    expect(stampPlaceProvenance({ slug: "x", source: "manual" }).confidence).toBe("curated");
    expect(stampPlaceProvenance({ slug: "x", source: "dfp" }).confidence).toBe("verified");
    expect(stampPlaceProvenance({ slug: "x", source: "google" }).confidence).toBe("verified");
    expect(stampPlaceProvenance({ slug: "x", source: "fc-gis" }).confidence).toBe("verified");
    // The discovery tail: no source field means scraped, never a guess.
    expect(stampPlaceProvenance({ slug: "x" }).confidence).toBe("scraped");
    expect(stampPlaceProvenance({ slug: "x" }).source).toBe("discovered");
    // An unknown future source falls to scraped rather than inheriting trust.
    expect(stampPlaceProvenance({ slug: "x", source: "mystery" }).confidence).toBe("scraped");
  });

  it("derives stable ids and record urls", () => {
    const withId = stampPlaceProvenance({ slug: "a", source: "google", google_place_id: "PID123" });
    expect(withId.source_id).toBe("PID123");
    expect(withId.source_url).toContain("place_id:PID123");
    const withoutId = stampPlaceProvenance({ slug: "a", source: "seed" });
    expect(withoutId.source_id).toBe("slug:a");
    expect(withoutId.source_url).toBeNull();
  });

  it("never builds a Google Maps link from a partner UUID (DQ-020)", () => {
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const row = stampPlaceProvenance({ slug: "u", source: "google", google_place_id: uuid });
    // The id is still recorded, but the fabricated place_id: link is suppressed.
    expect(row.source_id).toBe(uuid);
    expect(row.source_url).toBeNull();
  });

  it("falls back through timestamps to the documented backfill epoch", () => {
    const dated = stampPlaceProvenance({ slug: "a", source: "seed", updated_at: "2026-01-02T00:00:00Z" });
    expect(dated.first_seen_at).toBe("2026-01-02T00:00:00Z");
    const bare = stampPlaceProvenance({ slug: "a", source: "seed" });
    expect(bare.first_seen_at).toBe(PROVENANCE_BACKFILL_EPOCH);
    expect(bare.last_verified_at).toBe(PROVENANCE_BACKFILL_EPOCH);
    const verified = stampPlaceProvenance({ slug: "a", source: "seed" }, "2026-06-01T00:00:00Z");
    expect(verified.last_verified_at).toBe("2026-06-01T00:00:00Z");
  });

  it("every last_verified_at parses as a real date", () => {
    for (const raw of PLACES) {
      const row = decoratePlace(raw);
      expect(Number.isNaN(Date.parse(row.last_verified_at))).toBe(false);
    }
  });
});

describe("event provenance (data brief 4.1, event side)", () => {
  it("every upcoming curated event carries all seven fields after decoration", () => {
    const missing: Record<string, string[]> = {};
    for (const raw of upcomingEvents(new Date("2026-06-10T12:00:00Z"))) {
      const row = getEventBySlug(raw.slug) as unknown as Record<string, unknown> | null;
      if (!row) continue;
      for (const f of PROVENANCE_FIELDS) {
        if (!(f in row) || row[f] === undefined) {
          (missing[raw.slug] ??= []).push(f);
        }
      }
    }
    expect(
      Object.keys(missing).length,
      `events missing provenance: ${JSON.stringify(Object.entries(missing).slice(0, 5))}`,
    ).toBe(0);
  });

  it("maps event sources to their trust tiers", () => {
    expect(stampEventProvenance({ slug: "x", source: "seed" }).confidence).toBe("curated");
    expect(stampEventProvenance({ slug: "x", source: "dfp" }).confidence).toBe("verified");
    expect(stampEventProvenance({ slug: "x", source: "celebrate" }).confidence).toBe("verified");
    expect(stampEventProvenance({ slug: "x", source: "county" }).confidence).toBe("verified");
    expect(stampEventProvenance({ slug: "x", source: "ticketmaster" }).confidence).toBe("verified");
    expect(stampEventProvenance({ slug: "x", source: "bandsintown" }).confidence).toBe("verified");
    expect(stampEventProvenance({ slug: "x", source: "venue-extract" }).confidence).toBe("scraped");
    expect(stampEventProvenance({ slug: "x", source: "mystery" }).confidence).toBe("scraped");
  });

  it("normalizes a missing source url to null, never undefined", () => {
    expect(stampEventProvenance({ slug: "x", source: "seed" }).source_url).toBeNull();
    expect(stampEventProvenance({ slug: "x", source: "dfp", source_url: "https://a.b" }).source_url).toBe("https://a.b");
  });

  it("keeps a missing event verification date explicit", () => {
    expect(
      stampEventProvenance({ slug: "undated", source: "seed" })
        .last_verified_at,
    ).toBeNull();
    expect(
      stampEventProvenance({
        slug: "dated",
        source: "manual",
        last_verified_at: "2026-07-29T12:00:00.000Z",
      }).last_verified_at,
    ).toBe("2026-07-29T12:00:00.000Z");
  });

  it("does not add a cohort verification date to an undated curated row", () => {
    const raw = upcomingEvents(new Date("2026-06-10T12:00:00Z")).find(
      (event) => !event.last_verified_at,
    );
    expect(raw).toBeDefined();
    expect(getEventBySlug(raw!.slug)?.last_verified_at).toBeNull();
  });
});
