import { describe, expect, it } from "vitest";
import {
  horizonLeadVariant,
  primaryLeadPrecedesInterestRail,
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
