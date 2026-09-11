import { describe, expect, it } from "vitest";
import {
  analyzeHoursRefreshChange,
  isIsoCalendarDate,
  renderHoursRefreshReview,
} from "../scripts/hours-refresh-review.mjs";

const OPEN_HOURS = { mon: [{ open: "09:00", close: "17:00" }] };

function place(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    name: slug.replace(/-/g, " "),
    category: "coffee",
    municipality: "frederick",
    ...overrides,
  };
}

function artifact(
  rows: Record<string, Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    _meta: {
      generated_at: "2026-07-31T12:00:00.000Z",
      fresh_schedule_rows: 1,
      unmatched_rows: 0,
      ...overrides,
    },
    ...rows,
  };
}

describe("hours refresh review manifest", () => {
  it("validates real calendar dates instead of accepting shape alone", () => {
    expect(isIsoCalendarDate("2026-02-28")).toBe(true);
    expect(isIsoCalendarDate("2026-02-30")).toBe(false);
    expect(isIsoCalendarDate("2026-2-8")).toBe(false);
  });

  it("flags public removals and newly closed statuses without hiding the coverage gain", () => {
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: artifact({
        cafe: {
          business_status: "OPERATIONAL",
          refreshed_at: "2026-07-30T12:00:00.000Z",
        },
        bakery: {
          business_status: "OPERATIONAL",
          refreshed_at: "2026-07-30T12:00:00.000Z",
        },
      }),
      afterArtifact: artifact(
        {
          cafe: {
            business_status: "CLOSED_PERMANENTLY",
            refreshed_at: "2026-07-31T08:00:00.000Z",
          },
          bakery: {
            business_status: "OPERATIONAL",
            refreshed_at: "2026-07-31T08:00:00.000Z",
          },
        },
        { fresh_schedule_rows: 2, unmatched_rows: 3 },
      ),
      beforePlaces: [place("cafe"), place("bakery")],
      afterPlaces: [
        place("bakery", {
          hours_verified: true,
          hours: OPEN_HOURS,
        }),
      ],
    });

    expect(analysis.review_required).toBe(true);
    expect(analysis.publicRemovals).toEqual(["cafe"]);
    expect(analysis.newlyClosed).toMatchObject([
      {
        slug: "cafe",
        from: "OPERATIONAL",
        to: "CLOSED_PERMANENTLY",
        public_before: true,
        public_after: false,
      },
    ]);
    expect(analysis.after_published_hours).toBe(1);
    expect(analysis.unmatched_rows).toBe(3);

    const report = renderHoursRefreshReview(analysis);
    expect(report).toContain("**Manual review required:**");
    expect(report).toContain("`cafe`");
    expect(report).toContain("CLOSED_PERMANENTLY");
    expect(report).toContain(
      "| Fresh schedule rows in snapshot | 1 | 2 | +1 |",
    );
    expect(report).toContain("| Unmatched database rows ignored | — | 3 | — |");
  });

  it("reports a safe schedule-only refresh without inventing a review issue", () => {
    const before = artifact({
      cafe: {
        business_status: "OPERATIONAL",
        refreshed_at: "2026-07-30T12:00:00.000Z",
      },
    });
    const after = artifact(
      {
        cafe: {
          business_status: "OPERATIONAL",
          refreshed_at: "2026-07-31T08:00:00.000Z",
        },
      },
      { fresh_schedule_rows: 2 },
    );
    const places = [place("cafe", { hours_verified: true, hours: OPEN_HOURS })];
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: before,
      afterArtifact: after,
      beforePlaces: places,
      afterPlaces: places,
    });

    expect(analysis.review_required).toBe(false);
    expect(analysis.publicAdditions).toEqual([]);
    expect(analysis.publicRemovals).toEqual([]);
    expect(analysis.newlyClosed).toEqual([]);
    expect(renderHoursRefreshReview(analysis)).toContain(
      "No unreviewed public catalog or public closure transition requires manual review.",
    );
  });

  it("makes reopenings and unexpected public additions explicit", () => {
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: artifact({
        cafe: {
          business_status: "CLOSED_TEMPORARILY",
          refreshed_at: "2026-07-30T12:00:00.000Z",
        },
      }),
      afterArtifact: artifact({
        cafe: {
          business_status: "OPERATIONAL",
          refreshed_at: "2026-07-31T08:00:00.000Z",
        },
      }),
      beforePlaces: [],
      afterPlaces: [place("cafe")],
    });

    expect(analysis.publicAdditions).toEqual(["cafe"]);
    expect(analysis.reopenings).toMatchObject([
      {
        slug: "cafe",
        from: "CLOSED_TEMPORARILY",
        to: "OPERATIONAL",
        public_after: true,
      },
    ]);
    const report = renderHoursRefreshReview(analysis);
    expect(report).toContain("Added to public discovery");
    expect(report).toContain("Reopened");
    expect(report).toContain("OPERATIONAL");
  });

  it("flags a public removal even when no provider closure explains it", () => {
    const before = artifact({
      park: {
        business_status: "OPERATIONAL",
        refreshed_at: "2026-07-30T12:00:00.000Z",
      },
    });
    const after = artifact({
      park: {
        business_status: "OPERATIONAL",
        refreshed_at: "2026-07-31T08:00:00.000Z",
      },
    });
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: before,
      afterArtifact: after,
      beforePlaces: [place("park", { category: "park" })],
      afterPlaces: [],
    });

    expect(analysis.review_required).toBe(true);
    expect(analysis.publicRemovals).toEqual(["park"]);
    expect(analysis.newlyClosed).toEqual([]);
    expect(renderHoursRefreshReview(analysis)).toContain(
      "No new provider closure",
    );
  });

  it("records current source-backed closure evidence as reviewed", () => {
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: artifact({
        cafe: {
          business_status: "OPERATIONAL",
          refreshed_at: "2026-07-30T12:00:00.000Z",
        },
      }),
      afterArtifact: artifact({
        cafe: {
          business_status: "CLOSED_PERMANENTLY",
          refreshed_at: "2026-07-31T08:00:00.000Z",
        },
      }),
      beforePlaces: [place("cafe")],
      afterPlaces: [],
      statusOverrides: {
        cafe: {
          status: "closed_permanently",
          effective_at: "2026-07-31",
          review_after: "2026-10-31",
          source: "https://example.com/official-closure",
          note: "The business published a permanent closure notice.",
        },
      },
    });

    expect(analysis.review_required).toBe(false);
    expect(analysis.unreviewedPublicRemovals).toEqual([]);
    expect(analysis.unreviewedNewlyClosed).toEqual([]);
    expect(renderHoursRefreshReview(analysis)).toContain(
      "[Recorded](https://example.com/official-closure)",
    );
  });

  it("does not re-open review for a removal caused by an active manual closure", () => {
    const before = artifact({
      cafe: {
        business_status: "OPERATIONAL",
        refreshed_at: "2026-07-30T12:00:00.000Z",
      },
    });
    const after = artifact({
      cafe: {
        business_status: "OPERATIONAL",
        refreshed_at: "2026-07-31T08:00:00.000Z",
      },
    });
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: before,
      afterArtifact: after,
      beforePlaces: [place("cafe")],
      afterPlaces: [],
      statusOverrides: {
        cafe: {
          status: "closed_permanently",
          effective_at: "2026-07-30",
          review_after: "2026-10-31",
          source: "https://example.com/official-closure",
          note: "The business published a permanent closure notice.",
        },
      },
    });

    expect(analysis.statusTransitions).toEqual([]);
    expect(analysis.review_required).toBe(false);
    expect(analysis.unreviewedPublicRemovals).toEqual([]);
    expect(renderHoursRefreshReview(analysis)).toContain(
      "[Recorded](https://example.com/official-closure)",
    );
  });

  it("accepts a current operational correction as review of a false closure", () => {
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: artifact({}),
      afterArtifact: artifact({
        clinic: {
          business_status: "CLOSED_PERMANENTLY",
          refreshed_at: "2026-07-31T08:00:00.000Z",
        },
      }),
      beforePlaces: [place("clinic")],
      afterPlaces: [place("clinic")],
      statusOverrides: {
        clinic: {
          status: "operational",
          effective_at: "2026-07-31",
          review_after: "2026-08-15",
          source: "https://example.com/official-location",
          note: "The current official location page still offers appointments.",
        },
      },
    });

    expect(analysis.review_required).toBe(false);
    expect(analysis.unreviewedNewlyClosed).toEqual([]);
    expect(renderHoursRefreshReview(analysis)).toContain(
      "[Operational correction](https://example.com/official-location)",
    );
  });

  it("does not let an operational correction clear an unexplained public removal", () => {
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: artifact({
        clinic: {
          business_status: "OPERATIONAL",
          refreshed_at: "2026-07-30T12:00:00.000Z",
        },
      }),
      afterArtifact: artifact({
        clinic: {
          business_status: "CLOSED_PERMANENTLY",
          refreshed_at: "2026-07-31T08:00:00.000Z",
        },
      }),
      beforePlaces: [place("clinic")],
      afterPlaces: [],
      statusOverrides: {
        clinic: {
          status: "operational",
          effective_at: "2026-07-31",
          review_after: "2026-08-15",
          source: "https://example.com/official-location",
          note: "The current official location page still offers appointments.",
        },
      },
    });

    expect(analysis.review_required).toBe(true);
    expect(analysis.unreviewedPublicRemovals).toEqual(["clinic"]);
    expect(analysis.unreviewedNewlyClosed).toEqual([]);

    const report = renderHoursRefreshReview(analysis);
    expect(report).toContain("1 unreviewed public listing removal(s)");
    expect(report).toContain(
      "[Operational correction](https://example.com/official-location)",
    );
  });

  it.each([
    {
      effective_at: "2026-02-30",
      review_after: "2026-10-31",
      label: "an impossible effective date",
    },
    {
      effective_at: "2026-08-01",
      review_after: "2026-07-31",
      label: "an effective date after its review deadline",
    },
  ])("does not accept closure evidence with $label", (dates) => {
    const analysis = analyzeHoursRefreshChange({
      beforeArtifact: artifact({
        cafe: {
          business_status: "OPERATIONAL",
          refreshed_at: "2026-07-30T12:00:00.000Z",
        },
      }),
      afterArtifact: artifact({
        cafe: {
          business_status: "CLOSED_PERMANENTLY",
          refreshed_at: "2026-07-31T08:00:00.000Z",
        },
      }),
      beforePlaces: [place("cafe")],
      afterPlaces: [],
      statusOverrides: {
        cafe: {
          status: "closed_permanently",
          effective_at: dates.effective_at,
          review_after: dates.review_after,
          source: "https://example.com/official-closure",
          note: "The business published a permanent closure notice.",
        },
      },
    });

    expect(analysis.review_required).toBe(true);
    expect(analysis.unreviewedPublicRemovals).toEqual(["cafe"]);
    expect(analysis.unreviewedNewlyClosed).toHaveLength(1);
  });
});
