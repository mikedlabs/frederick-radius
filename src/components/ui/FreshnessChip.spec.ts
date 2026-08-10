import { describe, expect, it } from "vitest";
import { freshnessLabel } from "./FreshnessChip";

const NOW = Date.parse("2026-08-10T16:00:00.000Z");

describe("freshnessLabel", () => {
  it("names the exact field that was checked", () => {
    expect(
      freshnessLabel({
        iso: "2026-08-10T12:00:00.000Z",
        now: NOW,
        subject: "Hours",
      })?.label,
    ).toBe("Hours checked at source · 4h ago");
  });

  it("does not turn a listing timestamp into an hours claim", () => {
    expect(
      freshnessLabel({
        iso: "2026-08-01T16:00:00.000Z",
        now: NOW,
        subject: "Listing",
      })?.label,
    ).toBe("Listing checked at source · 9d ago");
  });

  it("rejects invalid and future timestamps", () => {
    expect(
      freshnessLabel({ iso: "not-a-date", now: NOW, subject: "Event" }),
    ).toBeNull();
    expect(
      freshnessLabel({
        iso: "2026-08-11T16:00:00.000Z",
        now: NOW,
        subject: "Event",
      }),
    ).toBeNull();
  });
});
