import { describe, expect, it } from "vitest";
import { formatHoursLine } from "@/lib/hours";
import * as language from "@/lib/trust-language";
import {
  CHECKED_AT_SOURCE,
  FROM_PUBLIC_CALENDAR,
  HOURS_NOT_CONFIRMED,
  HOURS_NOT_POSTED,
  LIKELY_OPEN_CHECK_HOURS,
  OPEN_NOW_TITLE,
  REPORT_A_CHANGE,
  checkedLabel,
  formatTrustAge,
  formatTrustDate,
  freshnessPhrase,
  hoursTrustPhrase,
  openNowSummary,
  placeTrustSegments,
  updatedLabel,
} from "@/lib/trust-language";

// Wed Oct 7 2026, 2:00 PM Eastern.
const NOW = Date.parse("2026-10-07T18:00:00.000Z");
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const tableStrings = () =>
  (Object.values(language) as unknown[]).filter(
    (value): value is string => typeof value === "string",
  );

describe("trust vocabulary", () => {
  it("keeps the hours strings Ask matches exactly", () => {
    // src/lib/ask/answer.ts and AskFrederick compare against these literally.
    expect(HOURS_NOT_POSTED).toBe("Hours not posted");
    expect(HOURS_NOT_CONFIRMED).toBe("Hours not confirmed");
    expect(LIKELY_OPEN_CHECK_HOURS).toBe("Likely open · check hours");
  });

  it("is the table the hours status line reads", () => {
    expect(formatHoursLine({ state: "unknown" })).toBe(HOURS_NOT_POSTED);
    expect(formatHoursLine({ state: "unknown", reason: "stale" })).toBe(HOURS_NOT_CONFIRMED);
    expect(formatHoursLine({ state: "unverified" })).toBe(HOURS_NOT_CONFIRMED);
  });

  it("names feed rows plainly and keeps 'Live' out of provenance", () => {
    expect(FROM_PUBLIC_CALENDAR).toBe("From a public calendar");
    expect(CHECKED_AT_SOURCE).toBe("Checked at source");
    expect(REPORT_A_CHANGE).toBe("Report a change");
    expect(OPEN_NOW_TITLE).toBe("Likely open now");
    expect(tableStrings()).not.toContain("Live");
  });

  it("never ships an em dash in user-facing copy", () => {
    const strings = tableStrings();
    const summaries = [openNowSummary(0, 0), openNowSummary(0, 4), openNowSummary(1, 0), openNowSummary(12, 3)];
    for (const text of [...strings, ...summaries]) expect(text).not.toMatch(/—/);
  });
});

describe("formatTrustDate", () => {
  it("says 'Jun 15' within the year and adds the year otherwise", () => {
    expect(formatTrustDate("2026-06-15T16:00:00.000Z", NOW)).toBe("Jun 15");
    expect(formatTrustDate("2025-05-14T16:00:00.000Z", NOW)).toBe("May 14, 2025");
  });

  it("does not slide a calendar date back a day on Eastern time", () => {
    // The raw footer printed "Updated 2026-05-14"; the pipeline writes dates
    // as YYYY-MM-DD or as midnight UTC, both of which are 8 PM the day
    // before in Frederick.
    expect(formatTrustDate("2026-05-20", NOW)).toBe("May 20");
    expect(formatTrustDate("2026-08-22T00:00:00.000Z", NOW)).toBe("Aug 22");
    expect(formatTrustDate("2025-12-31", NOW)).toBe("Dec 31, 2025");
  });

  it("reads a real instant on the Frederick clock", () => {
    // 10:30 PM Oct 6 in Frederick is already Oct 7 in UTC.
    expect(formatTrustDate("2026-10-07T02:30:00.000Z", NOW)).toBe("Oct 6");
  });

  it("returns null instead of guessing", () => {
    expect(formatTrustDate(undefined, NOW)).toBeNull();
    expect(formatTrustDate("", NOW)).toBeNull();
    expect(formatTrustDate("not-a-date", NOW)).toBeNull();
  });
});

describe("formatTrustAge", () => {
  it("is relative inside a day and a trust date after it", () => {
    expect(formatTrustAge(ago(30_000), NOW)).toBe("just now");
    expect(formatTrustAge(ago(12 * 60_000), NOW)).toBe("12 min ago");
    expect(formatTrustAge(ago(HOUR), NOW)).toBe("1 hour ago");
    expect(formatTrustAge(ago(5 * HOUR), NOW)).toBe("5 hours ago");
    expect(formatTrustAge(ago(26 * HOUR), NOW)).toBe("Oct 6");
    expect(formatTrustAge(ago(400 * 24 * HOUR), NOW)).toBe("Sep 2, 2025");
  });

  it("never turns a calendar date into a fake hour count", () => {
    expect(formatTrustAge("2026-10-07", NOW)).toBe("Oct 7");
    expect(formatTrustAge("2026-10-07T00:00:00.000Z", NOW)).toBe("Oct 7");
  });

  it("forgives clock skew but makes no claim about the future", () => {
    expect(formatTrustAge(new Date(NOW + 5_000).toISOString(), NOW)).toBe("just now");
    expect(formatTrustAge(new Date(NOW + 3 * HOUR).toISOString(), NOW)).toBeNull();
  });
});

describe("freshness phrases", () => {
  it("dates checks and updates in the one format", () => {
    expect(checkedLabel("2026-06-15", NOW)).toBe("Checked Jun 15");
    expect(updatedLabel(ago(3 * HOUR), NOW)).toBe("Updated 3 hours ago");
    expect(checkedLabel(undefined, NOW)).toBeNull();
  });

  it("says a feed row was read, not checked", () => {
    expect(freshnessPhrase("Event", "feed", ago(HOUR), NOW)).toBe("Calendar read 1 hour ago");
    expect(freshnessPhrase("Event", "feed", ago(3 * 24 * HOUR), NOW)).toBe("Calendar read Oct 4");
  });

  it("keeps 'checked at source' for real checks", () => {
    expect(freshnessPhrase("Hours", "checked", ago(4 * HOUR), NOW)).toBe(
      "Hours checked at source · 4 hours ago",
    );
  });
});

describe("hoursTrustPhrase", () => {
  it("names what Radius cannot say and stays quiet for confirmed hours", () => {
    expect(hoursTrustPhrase({ state: "unknown" })).toBe(HOURS_NOT_POSTED);
    expect(hoursTrustPhrase({ state: "unknown", reason: "stale" })).toBe(HOURS_NOT_CONFIRMED);
    expect(hoursTrustPhrase({ state: "unverified" })).toBe(HOURS_NOT_CONFIRMED);
    expect(hoursTrustPhrase({ state: "open", closesAt: "21:00", closingSoon: false })).toBeNull();
    expect(hoursTrustPhrase({ state: "closed" })).toBeNull();
  });
});

describe("placeTrustSegments", () => {
  it("writes the place page trust line from the audit", () => {
    expect(
      placeTrustSegments({
        detailsCheckedAt: "2026-05-20",
        hoursStatus: { state: "unknown", reason: "stale" },
        hoursCheckedAt: "2026-05-14T00:00:00.000Z",
        now: NOW,
      }),
    ).toEqual(["Details checked May 20", "Hours not confirmed"]);
  });

  it("does not call a place with no schedule unconfirmed", () => {
    expect(
      placeTrustSegments({
        detailsCheckedAt: "2026-05-20",
        hoursStatus: { state: "unknown" },
        now: NOW,
      }),
    ).toEqual(["Details checked May 20", "Hours not posted"]);
  });

  it("dates confirmed hours and folds a shared check date into one segment", () => {
    const open = { state: "open", closesAt: "21:00", closingSoon: false } as const;
    expect(
      placeTrustSegments({
        detailsCheckedAt: "2026-08-22",
        hoursStatus: open,
        hoursCheckedAt: "2026-08-22T00:00:00.000Z",
        now: NOW,
      }),
    ).toEqual(["Details and hours checked Aug 22"]);
    expect(
      placeTrustSegments({
        detailsCheckedAt: "2026-05-20",
        hoursStatus: open,
        hoursCheckedAt: "2026-10-05T15:00:00.000Z",
        now: NOW,
      }),
    ).toEqual(["Details checked May 20", "Hours checked Oct 5"]);
  });

  it("drops a segment it cannot date rather than inventing one", () => {
    expect(
      placeTrustSegments({
        detailsCheckedAt: "not-a-date",
        hoursStatus: { state: "closed" },
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe("openNowSummary", () => {
  it("states the basis and the caveat once, with the count as support", () => {
    expect(openNowSummary(12, 3)).toBe(
      "Recently checked hours say 12 places are open right now. Hours can still change, so check before a special trip.",
    );
    expect(openNowSummary(1, 0)).toMatch(/^Recently checked hours say 1 place is open right now\./);
  });

  it("never says 'confirmed open'", () => {
    for (const text of [openNowSummary(5, 0), openNowSummary(0, 5), openNowSummary(0, 0)]) {
      expect(text).not.toMatch(/confirmed open/i);
      expect(text).toMatch(/\.$/);
    }
  });

  it("points at the likely list only when it renders", () => {
    expect(openNowSummary(0, 4)).toMatch(/places below/);
    expect(openNowSummary(0, 0)).not.toMatch(/below/);
  });
});
