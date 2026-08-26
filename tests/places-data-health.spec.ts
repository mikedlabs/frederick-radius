import { describe, it, expect } from "vitest";
import places from "@/data/places-client.json" with { type: "json" };
import { PLACES as SOURCE_PLACES } from "@/data/places";
import overrides from "@/data/places-overrides.json" with { type: "json" };
import fieldNotes from "@/data/field-notes.json" with { type: "json" };
import { isValidCoord } from "@/lib/geo";
import { LANDMARK_PHOTOS } from "@/lib/integrations/wikimedia";

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
  name?: string;
  category?: string;
  address?: string;
  website?: string;
  tags?: string[];
  municipality?: string;
  state?: string;
  google_rating?: number;
  google_rating_count?: number;
  hours?: Partial<Record<string, HoursWindow[]>>;
  geom?: { lng: number; lat: number };
};

const PLACES = places as unknown as Place[];
const slugs = new Set(PLACES.map((p) => p.slug));
const sourceSlugs = new Set(SOURCE_PLACES.map((p) => p.slug));

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

  // Locks the 2026-06-20 out-of-county fix: 79 rows wore a member-town label
  // (a Boonsboro coffee shop tagged Myersville, a PA place tagged Brunswick)
  // but sat outside the county. The build filters on isValidCoord; this asserts
  // the COMMITTED artifact is clean so a bad coord can't leak one back in.
  it("keeps every place inside the county outline (+1.5km buffer)", () => {
    const bad = PLACES.filter((p) => !isValidCoord(p.geom ?? null));
    expect(bad.map((p) => `${p.slug} -> ${p.geom?.lng},${p.geom?.lat}`)).toEqual([]);
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

  it("keeps reviewed high-impact destinations in their decision category", () => {
    const categoryBySlug = new Map(
      PLACES.map((place) => [place.slug, place.category]),
    );
    expect(categoryBySlug.get("frederick-health-hospital")).toBe("wellness");
    expect(categoryBySlug.get("frederick-county-public-defender")).toBe(
      "government",
    );
    expect(categoryBySlug.get("fifty-fifty-smash-burger")).toBe("restaurant");
    expect(categoryBySlug.get("appalachian-bodywork")).toBe("massage");
    expect(categoryBySlug.get("sonus-center")).toBe("wellness");
    expect(categoryBySlug.get("william-r-talley-recreation-center")).toBe(
      "yoga",
    );
    expect(
      categoryBySlug.get(
        "frederick-county-department-of-planning-development-review",
      ),
    ).toBe("government");
  });

  it("quarantines wrong-business enrichment and withholds unsupported locations", () => {
    const bySlug = new Map(PLACES.map((place) => [place.slug, place]));
    const fcps = bySlug.get("frederick-county-public-school");
    const outreach = bySlug.get("outreach-healthcare-frederick");
    const grow = bySlug.get("growwith-abi");

    expect(fcps).toMatchObject({
      name: "Frederick County Public Schools",
      category: "government",
      address: "191 S East St",
      website: "https://www.fcps.org/connect_with_fcps",
    });
    expect(fcps?.google_rating).toBeUndefined();

    expect(outreach).toMatchObject({
      name: "Outreach Recovery",
      category: "wellness",
      address: "196 Thomas Johnson Dr, Ste 201",
      website: "https://outreachrecovery.com/locations/",
    });
    expect(outreach?.google_rating).toBeUndefined();

    // The operator's site confirms the service but publishes no Frederick
    // street address. Keep the source record for review without presenting
    // its inherited DFP point as a confirmed downtown location.
    expect(grow).toBeUndefined();
  });

  it("withholds a temporarily closed child-care location from discovery", () => {
    expect(
      slugs.has(
        "clubhouse-kids-at-monocacy-valley-montessori-public-school",
      ),
    ).toBe(false);
  });

  it("does not publish a former occupant after a verified replacement takes the address", () => {
    expect(slugs.has("k-town-takeout")).toBe(true);
    expect(slugs.has("mackies-southern-bbq")).toBe(false);
  });
});

describe("places-overrides referential integrity", () => {
  const ov = overrides as { patch?: Record<string, { clearEnrichment?: boolean }> };
  // A clearEnrichment quarantine (wrong-business sweep, UX audit P0) strips
  // ALL Google data from its slug, which usually drops the record below the
  // isSubstantive bar and out of the PUBLIC set — by design ("no page > a
  // lying page"). Those keys are not stale orphans: the base record still
  // exists and the patch is what hides it. Exempt them here; the base-record
  // typo check they still need lives in enrichmentBinding.spec.ts, which
  // resolves every quarantined slug against the base data files.
  const quarantined = new Set(
    Object.entries(ov.patch ?? {})
      .filter(([, p]) => p?.clearEnrichment)
      .map(([slug]) => slug),
  );

  it("every patch key resolves to a source place (no stale orphans)", () => {
    const orphans = Object.keys(ov.patch ?? {}).filter(
      (s) => !sourceSlugs.has(s) && !quarantined.has(s),
    );
    expect(orphans).toEqual([]);
  });

  // keepApart names the slugs the dedupe engine must NEVER fold together (the
  // manual veto on a false merge). If a dedupe change folded one away it would
  // vanish from the public set — assert every veto'd slug still resolves live,
  // unless the slug is deliberately hidden by an enrichment quarantine (the
  // veto still applies to the base record; it just isn't public right now).
  it("every keepApart slug survives as a distinct live place", () => {
    const ka = (overrides as { keepApart?: string[] }).keepApart ?? [];
    const folded = ka.filter((s) => !slugs.has(s) && !quarantined.has(s));
    expect(folded).toEqual([]);
  });
});

describe("wikimedia landmark-photo integrity", () => {
  // A curated Commons photo is keyed by place slug. If a slug is renamed the
  // entry would silently orphan (the photo just stops rendering) — assert each
  // resolves to a live place so the rename is caught here instead.
  it("every landmark-photo slug resolves to a live place", () => {
    const orphans = Object.keys(LANDMARK_PHOTOS).filter((s) => !slugs.has(s));
    expect(orphans).toEqual([]);
  });
});

describe("field-notes referential integrity", () => {
  it("every field-note key resolves to a source place", () => {
    // Quarantine exemption (same as the overrides checks above): a field note
    // on an enrichment-quarantined record stays attached to the hidden base
    // record pending the owner's per-record disposition pass — deleting or
    // reassigning owner-authored notes is a human call, not a build step.
    const ovq = overrides as { patch?: Record<string, { clearEnrichment?: boolean }> };
    const quarantined = new Set(
      Object.entries(ovq.patch ?? {})
        .filter(([, p]) => p?.clearEnrichment)
        .map(([slug]) => slug),
    );
    const orphans = Object.keys(fieldNotes as Record<string, unknown>).filter(
      (s) => !sourceSlugs.has(s) && !quarantined.has(s),
    );
    expect(orphans).toEqual([]);
  });
});
