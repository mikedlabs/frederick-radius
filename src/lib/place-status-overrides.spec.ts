import { describe, expect, it } from "vitest";
import type { Place } from "@/data/places";
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

  it("keeps first-party operational corrections explicit and time-bounded", () => {
    const corrections = [
      {
        slug: "green-health-docs",
        source:
          "https://greenhealthdocs.com/maryland-medical-marijuana-doctors/",
      },
      {
        slug: "saxbys-at-mount-st-marys-university-emmitsburg",
        source:
          "https://msmary.edu/student-life/living-on-campus/campus-dining.html",
      },
    ];

    for (const expected of corrections) {
      const override = manualPlaceStatusOverride(expected.slug);
      expect(isManualPlaceOperationalCorrection(override)).toBe(true);
      expect(override?.source).toBe(expected.source);
      expect(hasValidManualPlaceStatusEvidence(override!)).toBe(true);
      expect(
        activeManualPlaceStatusOverride(
          expected.slug,
          new Date("2026-08-01T12:00:00Z"),
        )?.status,
      ).toBe("operational");
      expect(
        activeManualPlaceStatusOverride(
          expected.slug,
          new Date("2026-08-16T12:00:00Z"),
        ),
      ).toBeUndefined();
      expect(publicPlaceBySlug(expected.slug)).toBeDefined();
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
