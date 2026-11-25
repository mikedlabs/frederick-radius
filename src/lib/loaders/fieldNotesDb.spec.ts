import { beforeEach, describe, expect, it, vi } from "vitest";

// The owner-authored rows the fake database returns for this test.
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/db/client", () => ({
  getSql: () => async () => db.rows,
}));

import { getDbDealsToday, mergeTodaysDeals } from "./fieldNotesDb";
import { todaysDeals, type TodaysDeal } from "./todaysDeals";

// The Wednesday the stale "Verified" pill was reported on Today.
const reported = new Date("2026-11-25T17:00:00Z");

/** No stale row may sit above a row whose check is inside the window. */
function currentChecksLead(rows: { verifiedCurrent?: boolean }[]) {
  const firstStale = rows.findIndex((row) => !row.verifiedCurrent);
  const lastCurrent = rows.findLastIndex((row) => Boolean(row.verifiedCurrent));
  return firstStale === -1 || lastCurrent < firstStale;
}

function deal(overrides: Partial<TodaysDeal>): TodaysDeal {
  return {
    slug: "fixture",
    name: "Fixture",
    offer: "$5 special",
    headline: "$5 special",
    verified: null,
    confidence: "high",
    ...overrides,
  };
}

function dbRow(slug: string, last_verified: string | null) {
  return {
    id: `db-${slug}`,
    place_slug: slug,
    kind: "deal",
    text: "$3 drafts all day",
    day_of_week: null,
    hours: null,
    source_url: null,
    confidence: "high",
    last_verified,
    expires_at: null,
    updated_at: "2026-11-25T12:00:00Z",
  };
}

describe("Today's merged deal strip", () => {
  beforeEach(() => {
    db.rows = [];
  });

  it("leads with a current check even when a stale one is downtown and named first", () => {
    const merged = mergeTodaysDeals(
      [
        deal({ slug: "a", name: "Alpha", downtown: true, verified: "last checked Jun 2026", verifiedCurrent: false }),
        deal({ slug: "z", name: "Zulu", downtown: false, confidence: "medium", verified: "verified 1d ago", verifiedCurrent: true }),
      ],
      [],
      6,
    );
    expect(merged.map((row) => row.slug)).toEqual(["z", "a"]);
  });

  it("puts the current check first in the order the visitor sees", () => {
    // The real committed notes on the reported day: one current check, the
    // rest last read in June. The strip the Today page renders is the merge.
    const json = todaysDeals(reported, 6);
    expect(json.some((row) => row.verifiedCurrent)).toBe(true);
    const merged = mergeTodaysDeals(json, [], 6);
    expect(merged[0].verifiedCurrent).toBe(true);
    expect(currentChecksLead(merged)).toBe(true);
    expect(currentChecksLead(mergeTodaysDeals(todaysDeals(reported, 999), [], 999))).toBe(true);
  });

  it("reads an owner-added row's freshness from its own recorded date", async () => {
    const slugs = todaysDeals(reported, 999).map((row) => row.slug);
    const [checked, undated, typo] = slugs;
    db.rows = [
      dbRow(checked, "2026-11-20"),
      dbRow(undated, null),
      dbRow(typo, "2027-11-20"),
    ];
    const rows = await getDbDealsToday(reported);
    const bySlug = new Map(rows.map((row) => [row.slug, row]));

    expect(bySlug.get(checked)).toMatchObject({ verified: "verified 5d ago", verifiedCurrent: true });
    // No recorded date is not a current check.
    expect(bySlug.get(undated)).toMatchObject({ verified: "Owner-added", verifiedCurrent: false });
    // A date ahead of the clock is not a current check either.
    expect(bySlug.get(typo)?.verifiedCurrent).toBe(false);
    expect(bySlug.get(typo)?.verified ?? "").not.toMatch(/verified/i);

    // The owner's fresh row outranks every June check in the merged strip.
    const merged = mergeTodaysDeals(todaysDeals(reported, 999), rows, 999);
    expect(currentChecksLead(merged)).toBe(true);
    expect(merged.findIndex((row) => row.slug === checked)).toBeLessThan(
      merged.findIndex((row) => row.slug === undated),
    );
  });
});
