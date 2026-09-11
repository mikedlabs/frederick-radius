import { describe, expect, it } from "vitest";
import type { OpenStatus } from "@/lib/hours";
import {
  mayAssertNoneOpen,
  mayOfferOpenNow,
  OPEN_NOW_MINIMUM_COVERAGE,
  openNowCountLabel,
} from "@/lib/hours-availability";

/**
 * The trust contract behind every "nothing is open" line.
 *
 * With the rolling hours snapshot empty, essentially every place resolves to
 * `unverified`, so an open-now query returns nothing and the old copy told
 * users the county was closed. These cases pin the distinction: a decided
 * closed state may be reported, an undecidable one may not.
 */

const closed: OpenStatus = { state: "closed" };
const open: OpenStatus = { state: "open", closesAt: "21:00", closingSoon: false };
const closingSoon: OpenStatus = { state: "closing-soon", closesAt: "20:15" };
const unverified: OpenStatus = { state: "unverified" };
const unknown: OpenStatus = { state: "unknown" };

const times = (status: OpenStatus, n: number) => Array.from({ length: n }, () => status);

describe("mayAssertNoneOpen", () => {
  it("reports closure when every place has a decided schedule", () => {
    expect(mayAssertNoneOpen(times(closed, 12))).toBe(true);
  });

  it("stays silent when no place can state an hour", () => {
    expect(mayAssertNoneOpen(times(unverified, 12))).toBe(false);
    expect(mayAssertNoneOpen(times(unknown, 12))).toBe(false);
  });

  it("stays silent on an empty set, where there is nothing to have measured", () => {
    expect(mayAssertNoneOpen([])).toBe(false);
  });

  it("counts open and closing-soon as decided states", () => {
    expect(mayAssertNoneOpen([open, closingSoon, closed, closed])).toBe(true);
  });

  it("holds the same bar the Open now control uses", () => {
    // 6 of 10 decided is exactly the threshold, 5 of 10 is under it.
    expect(OPEN_NOW_MINIMUM_COVERAGE).toBe(0.6);
    expect(mayAssertNoneOpen([...times(closed, 6), ...times(unverified, 4)])).toBe(true);
    expect(mayAssertNoneOpen([...times(closed, 5), ...times(unverified, 5)])).toBe(false);
  });

  it("describes today's catalog: a single verified row cannot speak for the rest", () => {
    expect(mayAssertNoneOpen([closed, ...times(unverified, 99)])).toBe(false);
  });
});

describe("openNowCountLabel", () => {
  it("labels a positive count as confirmed rather than implying full coverage", () => {
    expect(openNowCountLabel(3, false)).toBe("3 confirmed open");
  });

  it("only says none are open when the coverage policy allows that claim", () => {
    expect(openNowCountLabel(0, true)).toBe("None open now");
    expect(openNowCountLabel(0, false)).toBe("Open hours unconfirmed");
  });
});

describe("mayOfferOpenNow", () => {
  it("offers a known open result even when the rest of the set is unverified", () => {
    expect(mayOfferOpenNow([open, ...times(unverified, 99)])).toBe(true);
  });

  it("withholds a zero-result filter when the result set cannot state hours", () => {
    expect(mayOfferOpenNow(times(unverified, 12))).toBe(false);
    expect(mayOfferOpenNow([...times(closed, 6), ...times(unverified, 4)])).toBe(
      true,
    );
  });
});
