import { describe, expect, it } from "vitest";
import type { Place } from "@/data/places";
import { getOpenStatus } from "@/lib/hours";
import { isOperational, publicPlaceBySlug } from "@/lib/loaders/places";
import {
  activeManualPlaceStatusOverride,
  hasValidManualPlaceStatusEvidence,
  isManualPlaceOperationalCorrection,
  isManualPlaceStatusReviewCurrent,
  MANUAL_PLACE_STATUS_OVERRIDES,
  type ManualPlaceStatusOverride,
  manualPlaceStatusOverride,
} from "@/lib/place-status-overrides";

describe("manual place status overrides", () => {
  it("does not keep a removed closure override after an official reopening", () => {
    expect(
      manualPlaceStatusOverride("wiles-branch-dog-park-middletown"),
    ).toBeUndefined();
    expect(publicPlaceBySlug("wiles-branch-dog-park-middletown")).toBeDefined();
  });

  it("does not suppress another record with the same name", () => {
    const unrelated: Place = {
      slug: "unrelated-same-name",
      name: "Wiles Branch Dog Park",
      category: "park",
      short_blurb: "",
      address: "1 Example St",
      city: "Frederick",
      state: "MD",
      postal_code: "21701",
      municipality: "frederick",
      geom: { lng: -77.41, lat: 39.41 },
      is_verified: false,
      is_operational: "operational",
      feature_score: 1,
      source: "manual",
      updated_at: "2026-07-15",
    };
    expect(isOperational(unrelated)).toBe(true);
  });

  /**
   * Derived from the override file rather than a copy of it.
   *
   * This test used to list each correction with its own hardcoded activeAt
   * and expiredAt instants. That made renewing a review a two-file edit, and
   * when the Aug 15 deadlines lapsed while the merge queue was jammed, the
   * stale copy is what turned a three-place data review into a red `verify`
   * on every unrelated PR in the repo. Asserting the RULE against whatever
   * the data currently says cannot rot that way: a renewal is a pure data
   * edit, and the assertions stay true on both sides of every deadline.
   */
  it("keeps first-party operational corrections explicit and time-bounded", () => {
    const corrections = Object.entries(MANUAL_PLACE_STATUS_OVERRIDES).filter(
      ([, override]) => isManualPlaceOperationalCorrection(override),
    );
    // The mechanism is pointless if the file holds none, so pin that too.
    expect(corrections.length).toBeGreaterThan(0);

    const noon = (day: string) => new Date(`${day}T12:00:00Z`);
    const dayAfter = (day: string) => {
      const next = new Date(`${day}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    };

    for (const [slug, override] of corrections) {
      // Evidence must be a first-party https source a person can re-check.
      expect(hasValidManualPlaceStatusEvidence(override), slug).toBe(true);
      expect(override.review_after >= override.effective_at, slug).toBe(true);

      // Live for its whole reviewed window, gone the day after it closes.
      expect(
        activeManualPlaceStatusOverride(slug, noon(override.effective_at))
          ?.status,
        slug,
      ).toBe("operational");
      expect(
        activeManualPlaceStatusOverride(slug, noon(override.review_after))
          ?.status,
        slug,
      ).toBe("operational");
      expect(
        activeManualPlaceStatusOverride(slug, dayAfter(override.review_after)),
        slug,
      ).toBeUndefined();
      expect(
        isManualPlaceStatusReviewCurrent(override, dayAfter(override.review_after)),
        slug,
      ).toBe(false);

      // A correction that is active right now must actually be keeping its
      // place public — that is the entire reason it exists. Once it lapses
      // the place falls back to the provider's status, which this test
      // deliberately does not predict either way.
      if (activeManualPlaceStatusOverride(slug)) {
        expect(publicPlaceBySlug(slug), slug).toBeDefined();
      }
    }
  });

  it("keeps Concetta public without publishing unconfirmed hours", () => {
    const place = publicPlaceBySlug(
      "concettas-main-street-bistro-mount-airy",
    );

    expect(place).toBeDefined();
    expect(place?.is_operational).toBe("operational");
    expect(place?.hours).toBeUndefined();
    expect(place?.hours_verified).toBe(false);
    expect(
      getOpenStatus(
        place?.hours,
        { verified: place?.hours_verified },
        new Date("2026-08-10T16:00:00Z"),
      ).state,
    ).toBe("unknown");
  });

  it("uses the Frederick calendar day for review and effective dates", () => {
    const reviewedThroughAugust24: ManualPlaceStatusOverride = {
      status: "operational",
      effective_at: "2026-08-24",
      review_after: "2026-08-24",
      source: "https://example.com/official-status",
      note: "Test-only Eastern calendar boundary.",
    };

    expect(
      isManualPlaceStatusReviewCurrent(
        reviewedThroughAugust24,
        new Date("2026-08-25T00:30:00Z"),
      ),
    ).toBe(true);
    expect(
      isManualPlaceStatusReviewCurrent(
        reviewedThroughAugust24,
        new Date("2026-08-25T04:01:00Z"),
      ),
    ).toBe(false);

    const reviewedThroughDecember15: ManualPlaceStatusOverride = {
      ...reviewedThroughAugust24,
      effective_at: "2026-12-15",
      review_after: "2026-12-15",
    };
    expect(
      isManualPlaceStatusReviewCurrent(
        reviewedThroughDecember15,
        new Date("2026-12-16T04:30:00Z"),
      ),
    ).toBe(true);
    expect(
      isManualPlaceStatusReviewCurrent(
        reviewedThroughDecember15,
        new Date("2026-12-16T05:01:00Z"),
      ),
    ).toBe(false);

    const slug = "eastern-boundary-test-correction";
    MANUAL_PLACE_STATUS_OVERRIDES[slug] = reviewedThroughAugust24;
    try {
      expect(
        activeManualPlaceStatusOverride(
          slug,
          new Date("2026-08-24T03:59:00Z"),
        ),
      ).toBeUndefined();
      expect(
        activeManualPlaceStatusOverride(
          slug,
          new Date("2026-08-24T04:01:00Z"),
        ),
      ).toEqual(reviewedThroughAugust24);
    } finally {
      delete MANUAL_PLACE_STATUS_OVERRIDES[slug];
    }
  });

  it("keeps reviewed permanent closures suppressed with source evidence", () => {
    const closures = [
      {
        slug: "mazako",
        source:
          "https://mocoshow.com/2026/04/13/mazako-to-close-in-frederick-just-months-after-opening/",
      },
      {
        slug: "sabor-casero-bakery-frederick-frederick",
        source:
          "https://www.frederickcountymd.gov/DocumentCenter/View/344522",
      },
    ];

    for (const expected of closures) {
      const override = manualPlaceStatusOverride(expected.slug);
      expect(override?.status).toBe("closed_permanently");
      expect(override?.source).toBe(expected.source);
      expect(hasValidManualPlaceStatusEvidence(override!)).toBe(true);
      expect(
        activeManualPlaceStatusOverride(
          expected.slug,
          new Date("2026-08-01T12:00:00Z"),
        )?.status,
      ).toBe("closed_permanently");
      expect(publicPlaceBySlug(expected.slug)).toBeUndefined();
    }
  });

  it("rejects malformed or non-HTTPS evidence", () => {
    expect(
      hasValidManualPlaceStatusEvidence({
        status: "operational",
        effective_at: "2026-02-30",
        review_after: "2026-08-15",
        source: "http://example.com/not-secure",
        note: "Test evidence.",
      }),
    ).toBe(false);
    expect(
      hasValidManualPlaceStatusEvidence({
        status: "maybe-open",
        effective_at: "2026-07-31",
        review_after: "2026-08-15",
        source: "https://example.com/official-location",
        note: "Test evidence.",
      } as unknown as ManualPlaceStatusOverride),
    ).toBe(false);
  });

  it("does not activate a closure before its effective date", () => {
    const slug = "future-test-closure";
    MANUAL_PLACE_STATUS_OVERRIDES[slug] = {
      status: "closed_temporarily",
      effective_at: "2099-01-01",
      review_after: "2099-01-31",
      source: "https://example.com/official-closure",
      note: "Test-only future closure.",
    };
    try {
      expect(
        activeManualPlaceStatusOverride(
          slug,
          new Date("2026-08-01T12:00:00Z"),
        ),
      ).toBeUndefined();
    } finally {
      delete MANUAL_PLACE_STATUS_OVERRIDES[slug];
    }
  });

  it("does not activate a closure without valid evidence", () => {
    const slug = "invalid-test-closure";
    MANUAL_PLACE_STATUS_OVERRIDES[slug] = {
      status: "closed_permanently",
      effective_at: "2026-07-31",
      review_after: "2026-08-31",
      source: "not-a-url",
      note: "",
    };
    try {
      expect(
        activeManualPlaceStatusOverride(
          slug,
          new Date("2026-08-01T12:00:00Z"),
        ),
      ).toBeUndefined();
    } finally {
      delete MANUAL_PLACE_STATUS_OVERRIDES[slug];
    }
  });

  it("surfaces a missed review without treating its date as an automatic reopening", () => {
    const slug = "past-review-test-closure";
    const override: ManualPlaceStatusOverride = {
      status: "closed_temporarily",
      effective_at: "2026-07-04",
      review_after: "2026-07-22",
      source: "https://example.com/official-closure",
      note: "Closed until further notice.",
    };
    expect(
      isManualPlaceStatusReviewCurrent(
        override,
        new Date("2026-07-23T12:00:00Z"),
      ),
    ).toBe(false);
    MANUAL_PLACE_STATUS_OVERRIDES[slug] = override;
    try {
      expect(
        activeManualPlaceStatusOverride(
          slug,
          new Date("2026-07-23T12:00:00Z"),
        ),
      ).toEqual(override);
    } finally {
      delete MANUAL_PLACE_STATUS_OVERRIDES[slug];
    }
  });
});
