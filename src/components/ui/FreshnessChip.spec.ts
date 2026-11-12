import { describe, expect, it } from "vitest";
import { freshnessLabel, freshnessTitle } from "./FreshnessChip";

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

  it("prints a padded midnight-UTC check on the day it records", () => {
    const label = freshnessLabel({ iso: "2026-07-22T00:00:00.000Z", now: NOW, subject: "Listing" })?.label;
    expect(label).toMatch(/Jul 22/);
  });

  it("titles a date-only check with that day and no time", () => {
    expect(freshnessTitle("2026-07-22")).toBe("July 22, 2026");
    expect(freshnessTitle("2026-07-22T00:00:00.000Z")).toBe("July 22, 2026");
  });

  it("titles a real timestamp with its Eastern date and time", () => {
    expect(freshnessTitle("2026-07-22T02:30:00Z")).toBe("July 21, 2026 at 10:30 PM");
    expect(freshnessTitle("not a date")).toBeNull();
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
