import { describe, it, expect } from "vitest";
import { formatEventTime, formatEventDate } from "@/lib/format/eventTime";
import { easternWallToUtcISO } from "@/lib/tz";
import { parseCountyDateTime } from "@/lib/integrations/ical-live";

describe("formatEventTime", () => {
  it("renders the documented acceptance case (P0-1)", () => {
    // 2026-05-17T00:00Z is May 16 2026 8:00 PM EDT.
    expect(formatEventTime("2026-05-17T00:00:00Z")).toBe("8:00 PM");
  });

  it("stays correct across the March 2026 DST boundary", () => {
    // DST starts Sun Mar 8 2026. A 7:00 PM New York event must read
    // 7:00 PM both before (EST) and after (EDT) the switch.
    const beforeDst = easternWallToUtcISO(2026, 3, 7, 19, 0);
    const afterDst = easternWallToUtcISO(2026, 3, 9, 19, 0);
    expect(formatEventTime(beforeDst)).toBe("7:00 PM");
    expect(formatEventTime(afterDst)).toBe("7:00 PM");
    // The same wall time is a different UTC instant on each side.
    expect(beforeDst).not.toBe(afterDst);
  });

  it("handles morning times and date formatting", () => {
    // 2026-05-16T13:00Z = 9:00 AM EDT (the Canal Community Day case).
    expect(formatEventTime("2026-05-16T13:00:00Z")).toBe("9:00 AM");
    expect(formatEventDate("2026-05-17T00:00:00Z")).toBe("Sat, May 16");
  });
});

describe("parseCountyDateTime", () => {
  // The Frederick County RSS feed publishes Eastern wall-clock times
  // with no zone marker. They must resolve to the same UTC instant no
  // matter the server timezone. The bug was a bare new Date() reading
  // them as the server's local zone (UTC in production), which
  // rendered every county event four hours early.
  it("resolves an afternoon Eastern time, not server-local (EDT)", () => {
    // 5:30 PM EDT on May 14 is 21:30Z, and must render back as 5:30 PM.
    const d = parseCountyDateTime("May 14, 2026", "5:30 PM");
    expect(d?.toISOString()).toBe("2026-05-14T21:30:00.000Z");
    expect(formatEventTime(d!.toISOString())).toBe("5:30 PM");
  });

  it("resolves a morning Eastern time", () => {
    expect(parseCountyDateTime("May 14, 2026", "10:30 AM")?.toISOString()).toBe(
      "2026-05-14T14:30:00.000Z",
    );
  });

  it("handles noon and midnight", () => {
    expect(parseCountyDateTime("May 14, 2026", "12:00 PM")?.toISOString()).toBe(
      "2026-05-14T16:00:00.000Z",
    );
    expect(parseCountyDateTime("May 14, 2026", "12:00 AM")?.toISOString()).toBe(
      "2026-05-14T04:00:00.000Z",
    );
  });

  it("stays correct in EST (winter)", () => {
    // 5:00 PM EST on Jan 15 is 22:00Z.
    expect(parseCountyDateTime("January 15, 2026", "5:00 PM")?.toISOString()).toBe(
      "2026-01-15T22:00:00.000Z",
    );
  });

  it("anchors a date with no time at midday, never the prior day", () => {
    expect(parseCountyDateTime("May 14, 2026")?.toISOString()).toBe(
      "2026-05-14T16:00:00.000Z",
    );
  });

  it("returns null for an unparseable date", () => {
    expect(parseCountyDateTime("sometime next week", "5:00 PM")).toBeNull();
  });
});
