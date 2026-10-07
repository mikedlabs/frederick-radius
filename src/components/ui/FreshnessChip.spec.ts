import { describe, expect, it } from "vitest";
import { freshnessLabel } from "./FreshnessChip";

// Mon Aug 10 2026, noon Eastern.
const NOW = Date.parse("2026-08-10T16:00:00.000Z");

describe("freshnessLabel", () => {
  it("names the exact field that was checked", () => {
    expect(
      freshnessLabel({
        iso: "2026-08-10T12:00:00.000Z",
        now: NOW,
        subject: "Hours",
      })?.label,
    ).toBe("Hours checked at source · 4 hours ago");
  });

  it("does not turn a listing timestamp into an hours claim", () => {
    expect(
      freshnessLabel({
        iso: "2026-08-01T16:00:00.000Z",
        now: NOW,
        subject: "Listing",
      })?.label,
    ).toBe("Listing checked at source · Aug 1");
  });

  it("says a feed row's calendar was read, never that it was checked", () => {
    const label = freshnessLabel({
      iso: "2026-08-10T15:00:00.000Z",
      now: NOW,
      subject: "Event",
      basis: "feed",
    })?.label;
    expect(label).toBe("Calendar read 1 hour ago");
    expect(label).not.toMatch(/checked/i);
  });

  it("keeps 'checked at source' for an editor's event check", () => {
    expect(
      freshnessLabel({
        iso: "2026-07-20T16:00:00.000Z",
        now: NOW,
        subject: "Event",
        basis: "checked",
      })?.label,
    ).toBe("Event checked at source · Jul 20");
  });

  it("dates an old check in the one trust format and marks it stale", () => {
    const old = freshnessLabel({
      iso: "2025-12-02T16:00:00.000Z",
      now: NOW,
      subject: "Hours",
    });
    expect(old).toEqual({ tier: "stale", label: "Hours checked at source · Dec 2, 2025" });
    expect(
      freshnessLabel({ iso: "2026-06-15", now: NOW, subject: "Listing" }),
    ).toEqual({ tier: "recent", label: "Listing checked at source · Jun 15" });
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
