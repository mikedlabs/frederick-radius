import { describe, it, expect } from "vitest";
import {
  isRecommendable,
  RECOMMENDATION_DENY_TYPES,
  RECOMMEND_ALLOW_SLUGS,
} from "@/lib/relevance";
import { rankPlaces } from "@/lib/loaders/places";
import { FREDERICK_CENTER } from "@/lib/geo";

describe("isRecommendable (eligibility helper)", () => {
  it("denies pure-institution types from bulk imports", () => {
    expect(isRecommendable({ primary_type: "primary_school", source: "dfp", slug: "x" })).toBe(false);
    expect(isRecommendable({ primary_type: "university", source: "google", slug: "y" })).toBe(false);
    expect(isRecommendable({ primary_type: "child_care_agency", source: "dfp", slug: "z" })).toBe(false);
  });

  it("keeps vague/absent types (never guess a place away)", () => {
    expect(isRecommendable({ primary_type: undefined, source: "dfp", slug: "x" })).toBe(true);
    expect(isRecommendable({ primary_type: "restaurant", source: "dfp", slug: "x" })).toBe(true);
    // educational_institution is intentionally NOT denied (mixed bucket).
    expect(isRecommendable({ primary_type: "educational_institution", source: "dfp", slug: "x" })).toBe(true);
  });

  it("source guard: curated seed/manual institutions stay recommendable", () => {
    expect(isRecommendable({ primary_type: "school", source: "seed", slug: "x" })).toBe(true);
    expect(isRecommendable({ primary_type: "university", source: "manual", slug: "x" })).toBe(true);
  });

  it("rescue list overrides the type deny (Google mis-typed real venues)", () => {
    for (const slug of RECOMMEND_ALLOW_SLUGS) {
      expect(isRecommendable({ primary_type: "university", source: "dfp", slug })).toBe(true);
    }
  });
});

// ── The real product outcome: Family must stop leading with schools ──
describe("Family recommendation lead is editorially strict (real data)", () => {
  const REAL_OUTING = /escape|arcade|pinball|railroad|bowling|adventure park|science lab|\bvr\b|zoo|skating|mini ?golf/i;

  // Mirror the category page's recommendation pool (Worth your time).
  //
  // The hour is PINNED and PLURAL. rankPlaces defaults to new Date(), so
  // this spec used to sample whatever hour CI happened to run at, and the
  // school leak it exists to catch only appears in the morning — when a
  // high school is open and every arcade, bowling alley, and escape room
  // is not. It passed for days at afternoon run times and failed at 08:29.
  // A parent browsing Family at breakfast is exactly the reader this
  // guards, so the invariant is checked at three representative hours.
  const HOURS = [
    { label: "school-run morning", now: new Date("2026-08-07T12:30:00Z") },
    { label: "midday", now: new Date("2026-08-07T17:00:00Z") },
    { label: "evening", now: new Date("2026-08-08T00:00:00Z") },
  ] as const;

  const leadAt = (now: Date) =>
    rankPlaces({ category: "family", origin: FREDERICK_CENTER, now })
      .filter(isRecommendable)
      .slice(0, 10);

  // Midday for the "real outings lead" claim: that is a statement about
  // hours when family attractions are actually open. At 8:30 AM the arcades
  // and bowling alleys are closed and it is correct that they do not lead —
  // the school must still not, which is what the per-hour checks above
  // cover.
  const lead = leadAt(HOURS[1].now);

  it.each(HOURS)(
    "top-10 contains zero pure-school/institution records ($label)",
    ({ now }) => {
      const leaks = leadAt(now).filter(
        (p) =>
          p.primary_type &&
          RECOMMENDATION_DENY_TYPES.has(p.primary_type) &&
          !RECOMMEND_ALLOW_SLUGS.has(p.slug),
      );
      expect(leaks.map((p) => p.name)).toEqual([]);
    },
  );

  it("lifts at least 3 real family outings into the top-10", () => {
    const outings = lead.filter((p) => REAL_OUTING.test(p.name));
    expect(outings.length).toBeGreaterThanOrEqual(3);
  });

  it("does not delete institutions from the full set (still findable)", () => {
    // Browse/search keep everything — a school is still in the unfiltered set.
    const all = rankPlaces({ category: "family", origin: FREDERICK_CENTER });
    const schools = all.filter((p) => p.primary_type === "primary_school");
    expect(schools.length).toBeGreaterThan(0);
  });
});
