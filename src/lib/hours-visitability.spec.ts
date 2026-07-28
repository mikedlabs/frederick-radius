import { describe, expect, it } from "vitest";
import type { Hours } from "@/data/places";
import {
  hasReviewRequiredExtendedWindow,
  hasReviewedAllWeek24hVisitability,
  isAllWeekAllDay,
  is24hVisitabilityReviewCurrent,
  mayPublishVisitabilityHours,
} from "@/lib/hours-visitability";
import { getPlaceBySlug } from "@/lib/loaders/places";

const allWeek24h: Hours = {
  sun: [{ open: "00:00", close: "24:00" }],
  mon: [{ open: "00:00", close: "24:00" }],
  tue: [{ open: "00:00", close: "24:00" }],
  wed: [{ open: "00:00", close: "24:00" }],
  thu: [{ open: "00:00", close: "24:00" }],
  fri: [{ open: "00:00", close: "24:00" }],
  sat: [{ open: "00:00", close: "24:00" }],
};

describe("all-week 24-hour visitability policy", () => {
  it("recognizes all-week/all-day schedules", () => {
    expect(isAllWeekAllDay(allWeek24h)).toBe(true);
    expect(
      isAllWeekAllDay({ ...allWeek24h, sun: [{ open: "08:00", close: "20:00" }] }),
    ).toBe(false);
  });

  it("suppresses an unreviewed 24/7 claim", () => {
    expect(mayPublishVisitabilityHours("unreviewed-place", allWeek24h)).toBe(false);
  });

  it("keeps the source-reviewed hospital schedule", () => {
    const now = new Date("2026-07-15T12:00:00Z");
    expect(hasReviewedAllWeek24hVisitability("frederick-health-hospital", now)).toBe(true);
    expect(mayPublishVisitabilityHours("frederick-health-hospital", allWeek24h, now)).toBe(true);
  });

  it("expires a review instead of publishing it forever", () => {
    expect(is24hVisitabilityReviewCurrent("2026-07-14", new Date("2026-07-15T12:00:00Z"))).toBe(false);
    expect(
      mayPublishVisitabilityHours(
        "frederick-health-hospital",
        allWeek24h,
        new Date("2027-01-16T12:00:00Z"),
      ),
    ).toBe(false);
  });

  it("does not interfere with ordinary opening hours", () => {
    const ordinary = { ...allWeek24h, sun: [{ open: "08:00", close: "20:00" }] };
    const ordinaryWeek = {
      sun: [{ open: "08:00", close: "20:00" }],
      mon: [{ open: "08:00", close: "20:00" }],
    };
    expect(hasReviewRequiredExtendedWindow(ordinaryWeek)).toBe(false);
    expect(mayPublishVisitabilityHours("ordinary-place", ordinaryWeek)).toBe(true);
    // The all-week fixture still contains six 24-hour days and therefore
    // remains review-required even though Sunday is ordinary.
    expect(mayPublishVisitabilityHours("ordinary-place", ordinary)).toBe(false);
  });

  it("suppresses one implausible near-all-day window until reviewed", () => {
    const providerTypo: Hours = {
      thu: [{ open: "09:30", close: "05:30" }],
    };
    expect(hasReviewRequiredExtendedWindow(providerTypo)).toBe(true);
    expect(
      mayPublishVisitabilityHours("unreviewed-provider-typo", providerTypo),
    ).toBe(false);
  });

  it("allows a reviewed public 24-hour place through the extended-window guard", () => {
    const oneAllDayWindow: Hours = {
      wed: [{ open: "00:00", close: "24:00" }],
    };
    const now = new Date("2026-07-15T12:00:00Z");
    expect(hasReviewRequiredExtendedWindow(oneAllDayWindow)).toBe(true);
    expect(
      mayPublishVisitabilityHours(
        "frederick-health-hospital",
        oneAllDayWindow,
        now,
      ),
    ).toBe(true);
  });

  it("fails closed on malformed structured time values", () => {
    expect(
      hasReviewRequiredExtendedWindow({
        mon: [{ open: "9 AM", close: "17:00" }],
      }),
    ).toBe(true);
  });

  it("suppresses a known unreviewed provider row at the decorated boundary", () => {
    const place = getPlaceBySlug(
      "memorial-grounds",
      undefined,
      new Date("2026-07-15T12:00:00Z"),
    );
    expect(place).not.toBeNull();
    expect(place?.hours).toBeUndefined();
    expect(place?.hours_verified).toBe(false);
    expect(place?.google_hours).toBeUndefined();
    expect(place?.open_status.state).toBe("unknown");
  });
});
