import { describe, expect, it } from "vitest";
import { holdbackSlugs, spliceArtifact } from "../scripts/steward-holdback.mjs";
import { analyzeHoursRefreshChange } from "../scripts/hours-refresh-review.mjs";

/**
 * The hold-back exists so a decision that needs a human stops ONE slug
 * instead of the county. The review gate used to withhold auto-merge from
 * the entire nightly PR on any unreviewed flag; one flagged market then
 * stalled ~1,500 rows of fresh hours for days, and at steady state the
 * artifact's oldest rows sit ~14 hours from the 7-day publishing cliff.
 * These tests pin the three guarantees that make holding safe: unreviewed
 * changes revert to yesterday's reviewed values, EVIDENCED changes ship,
 * and the spliced artifact's own metadata stays truthful.
 */

const GENERATED_AT = "2026-08-19T08:00:00.000Z";
const FRESH_AT = "2026-08-19T07:00:00.000Z";
const OLD_AT = "2026-08-14T07:00:00.000Z";

const HOURS = ["Monday: 9:00 AM – 5:00 PM"];

function artifact(rows: Record<string, unknown>): Record<string, unknown> {
  return {
    _doc: "test",
    _meta: {
      schema_version: 2,
      generated_at: GENERATED_AT,
      rows: Object.keys(rows).length,
      unmatched_rows: 3,
    },
    ...rows,
  };
}

function place(slug: string) {
  return { slug, name: slug };
}

describe("steward hold-back", () => {
  it("holds every unreviewed flag and none of the evidenced ones", () => {
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: artifact({
        "stays-public": { business_status: "OPERATIONAL", refreshed_at: OLD_AT },
        "flagged-removal": { business_status: "OPERATIONAL", refreshed_at: OLD_AT },
        "evidenced-removal": { business_status: "OPERATIONAL", refreshed_at: OLD_AT },
      }),
      afterArtifact: artifact({
        "stays-public": { business_status: "OPERATIONAL", refreshed_at: FRESH_AT },
        "flagged-removal": { business_status: "CLOSED_TEMPORARILY", refreshed_at: FRESH_AT },
        "evidenced-removal": { business_status: "CLOSED_TEMPORARILY", refreshed_at: FRESH_AT },
        "flagged-addition": { business_status: "OPERATIONAL", refreshed_at: FRESH_AT },
        "evidenced-addition": { business_status: "OPERATIONAL", refreshed_at: FRESH_AT },
      }),
      beforePlaces: [place("stays-public"), place("flagged-removal"), place("evidenced-removal")],
      afterPlaces: [
        place("stays-public"),
        place("flagged-addition"),
        place("evidenced-addition"),
      ],
      statusOverrides: {
        "evidenced-removal": {
          status: "closed_temporarily",
          effective_at: "2026-08-18",
          review_after: "2027-05-01",
          source: "https://example.gov/closed",
          note: "The operator's own page says closed for the season.",
        },
        "evidenced-addition": {
          status: "operational",
          effective_at: "2026-08-18",
          review_after: "2027-05-01",
          source: "https://example.gov/open",
          note: "The operator's own page says open.",
        },
      },
    });

    const holds = holdbackSlugs(analysis);
    expect([...holds.keys()].sort()).toEqual([
      "flagged-addition",
      "flagged-removal",
    ]);
    // Evidence recorded in place-status-overrides.json releases the change
    // the same night: the whole point of the overrides file.
    expect(holds.has("evidenced-removal")).toBe(false);
    expect(holds.has("evidenced-addition")).toBe(false);
    // With everything unreviewed held, the re-run review comes back clean and
    // auto-merge proceeds. The evidenced changes remain in the diff, which is
    // correct: they are decided.
    expect(analysis.unreviewedPublicAdditions).toEqual(["flagged-addition"]);
    expect(analysis.unreviewedPublicRemovals).toEqual(["flagged-removal"]);
  });

  it("restores held rows to their HEAD values and keeps the metadata honest", () => {
    const head = artifact({
      "held-one": {
        business_status: "OPERATIONAL",
        weekday_hours: HOURS,
        refreshed_at: OLD_AT,
      },
      untouched: { business_status: "OPERATIONAL", refreshed_at: OLD_AT },
    });
    const fresh = artifact({
      "held-one": {
        business_status: "CLOSED_TEMPORARILY",
        refreshed_at: FRESH_AT,
      },
      untouched: {
        business_status: "OPERATIONAL",
        weekday_hours: HOURS,
        refreshed_at: FRESH_AT,
      },
      "held-new": { business_status: "OPERATIONAL", refreshed_at: FRESH_AT },
    });

    const spliced = spliceArtifact(
      fresh,
      head,
      new Map([
        ["held-one", "closure awaiting evidence"],
        ["held-new", "addition awaiting evidence"],
      ]),
    );

    // Yesterday's reviewed truth, verbatim: status, schedule, and the row's
    // own refreshed_at, so the freshness policy keeps aging it honestly and
    // a hold can never republish stale hours as current.
    expect(spliced["held-one"]).toEqual(head["held-one"]);
    // A slug with no HEAD row is simply absent, exactly as it was yesterday.
    expect(spliced["held-new"]).toBeUndefined();
    // Everything else ships fresh.
    expect(spliced["untouched"]).toEqual(fresh["untouched"]);

    // _meta is recomputed with the pull's own formulas over the spliced rows,
    // anchored on the pull's generated_at. unmatched_rows describes the pull
    // itself and is untouched.
    expect(spliced._meta.rows).toBe(2);
    expect(spliced._meta.with_schedule).toBe(2);
    expect(spliced._meta.fresh_schedule_rows).toBe(2);
    expect(spliced._meta.recent_rows).toBe(1);
    expect(spliced._meta.oldest_refreshed_at).toBe(OLD_AT);
    expect(spliced._meta.newest_refreshed_at).toBe(FRESH_AT);
    expect(spliced._meta.unmatched_rows).toBe(3);
    expect(spliced._meta.generated_at).toBe(GENERATED_AT);
  });

  it("holds nothing when every flag carries evidence", () => {
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: artifact({}),
      afterArtifact: artifact({
        newcomer: { business_status: "OPERATIONAL", refreshed_at: FRESH_AT },
      }),
      beforePlaces: [],
      afterPlaces: [place("newcomer")],
      statusOverrides: {
        newcomer: {
          status: "operational",
          effective_at: "2026-08-18",
          review_after: "2027-05-01",
          source: "https://example.gov/open",
          note: "The operator's own page says open.",
        },
      },
    });
    expect(holdbackSlugs(analysis).size).toBe(0);
    expect(analysis.review_required).toBe(false);
  });
});
