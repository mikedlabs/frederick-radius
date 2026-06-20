import { describe, it, expect } from "vitest";
import places from "@/data/places-client.json" with { type: "json" };
import overrides from "@/data/places-overrides.json" with { type: "json" };
import fieldNotes from "@/data/field-notes.json" with { type: "json" };

/**
 * Data-health guard — locks the invariants the 2026-06-20 all-business audit
 * (workflow wwvolblmx) verified clean or fixed, so the next enrichment/scrape
 * re-run can't silently re-introduce a known bug class. Runs on every change to
 * places-client.json.
 *
 * Backlog driven to zero and now asserted: the 952 malformed postal_codes (the
 * 5-digit ZIP guard below; the 4 remaining empties are addresses with no ZIP)
 * and the 3 inverted-hours "PM entered as AM" typos (the inverted-hours guard
 * below, fixed via an hours patch in places-overrides.json). Still tracked
 * separately, not yet a generic assertion: the phantom shared-Google-data
 * groups (suppressed per-slug via the `clearGoogle` override).
 */

type HoursWindow = { open: string; close: string };

type Place = {
  slug: string;
  category?: string;
  municipality?: string;
  state?: string;
  google_rating?: number;
  google_rating_count?: number;
  hours?: Partial<Record<string, HoursWindow[]>>;
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

  it("postal_code, when set, is a 5-digit ZIP (no 'MD'/'United States' leak)", () => {
    const bad = PLACES.filter((p) => {
      const z = String((p as { postal_code?: string }).postal_code ?? "");
      return z !== "" && !/^\d{5}$/.test(z);
    });
    expect(bad.map((p) => p.slug)).toEqual([]);
  });

  // A same-day interval whose close precedes its open is a "PM entered as AM"
  // typo (a restaurant Google reports as "closing" at 10:00). A close in the
  // small hours (≤ 05:59) is the legitimate late-night / overnight case (a bar
  // closing at 01:00), so it is excluded. Two genuine overnight operations are
  // allowlisted: an emergency shelter (18:30–07:00) and an inn whose hours
  // encode check-in/checkout (16:00–11:00), not a service window.
  const OVERNIGHT_OK = new Set([
    "alan-p-linton-jr-emergency-shelter",
    "strawberry-inn-new-market",
  ]);
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  it("has no inverted same-day hours (PM-as-AM typos)", () => {
    const bad: string[] = [];
    for (const p of PLACES) {
      if (OVERNIGHT_OK.has(p.slug) || !p.hours) continue;
      for (const [day, ivs] of Object.entries(p.hours)) {
        for (const iv of ivs ?? []) {
          if (!iv?.open || !iv?.close) continue;
          const o = toMin(iv.open);
          const c = toMin(iv.close);
          if (c < o && c >= 6 * 60) bad.push(`${p.slug} ${day} ${iv.open}-${iv.close}`);
        }
      }
    }
    expect(bad).toEqual([]);
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
