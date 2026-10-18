import { describe, expect, it } from "vitest";
import {
  horizonLeadVariant,
  primaryLeadPrecedesInterestRail,
  splitHorizonLead,
} from "./eventsExplorerLayout";

describe("primaryLeadPrecedesInterestRail", () => {
  it("moves the first feature ahead of interests in the populated recommended list", () => {
    expect(
      primaryLeadPrecedesInterestRail({
        view: "list",
        sort: "recommended",
        resultCount: 12,
        horizonCount: 3,
      }),
    ).toBe(true);
  });

  it.each([
    { view: "compact" as const, sort: "recommended" as const, resultCount: 12, horizonCount: 3 },
    { view: "list" as const, sort: "time" as const, resultCount: 12, horizonCount: 3 },
    { view: "list" as const, sort: "az" as const, resultCount: 12, horizonCount: 3 },
    { view: "list" as const, sort: "recommended" as const, resultCount: 0, horizonCount: 0 },
    { view: "list" as const, sort: "recommended" as const, resultCount: 4, horizonCount: 0 },
  ])("keeps interests before results for alternate or empty layouts", (layout) => {
    expect(primaryLeadPrecedesInterestRail(layout)).toBe(false);
  });
});

describe("horizonLeadVariant", () => {
  it("reserves the poster for the first horizon", () => {
    expect(horizonLeadVariant(0)).toBe("feature");
  });

  it("uses a restrained glance lead for later horizons", () => {
    expect(horizonLeadVariant(1)).toBe("glance");
    expect(horizonLeadVariant(4)).toBe("glance");
  });
});

describe("recommended horizon promotion", () => {
  const weak = { slug: "offer", venue_name: "Off Campus" };
  const real = { slug: "show", venue_name: "Community Hall" };

  it("selects a usable row at index 1 without dropping or repeating the others", () => {
    const rows = [weak, real];
    expect(splitHorizonLead(rows, "recommended")).toEqual({ lead: real, rest: [weak] });
    expect(rows).toEqual([weak, real]);
  });

  it("keeps an all-ambiguous horizon as ordinary listings rather than inventing a lead", () => {
    expect(splitHorizonLead([weak], "recommended")).toEqual({ lead: null, rest: [weak] });
    expect(splitHorizonLead([], "recommended")).toEqual({ lead: null, rest: [] });
  });

  it("removes only the selected occurrence, preserving another date with the same slug", () => {
    const first = { ...real, starts_at: "2026-07-14T18:00:00Z" };
    const later = { ...real, starts_at: "2026-07-15T18:00:00Z" };
    expect(splitHorizonLead([weak, first, later], "recommended")).toEqual({ lead: first, rest: [weak, later] });
  });

  it.each(["time", "az", "venue"] as const)("preserves the existing first-row behavior for %s", (sort) => {
    expect(splitHorizonLead([weak, real], sort)).toEqual({ lead: weak, rest: [real] });
  });
});
