import { afterEach, describe, expect, it, vi } from "vitest";
import { parseICal, parseICalResult } from "./parser";

describe("parseICalResult", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("distinguishes an invalid HTTP-success payload from a valid empty calendar", () => {
    expect(parseICalResult("<html><h1>Temporarily unavailable</h1></html>"))
      .toEqual({
        valid: false,
        events: [],
        error: "invalid iCalendar payload",
      });

    expect(
      parseICalResult(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Frederick Radius empty calendar test//EN
END:VCALENDAR`),
    ).toEqual({ valid: true, events: [] });
  });

  it("keeps the historical fail-soft array API for request-time consumers", () => {
    expect(parseICal("<html>not a calendar</html>")).toEqual([]);
  });

  it("anchors DST-transition all-day dates to New York midnight regardless of host timezone", () => {
    const calendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Frederick Radius DST test//EN
BEGIN:VEVENT
UID:spring-forward
DTSTAMP:20260101T120000Z
DTSTART;VALUE=DATE:20260308
SUMMARY:Spring Forward Day
END:VEVENT
BEGIN:VEVENT
UID:fall-back
DTSTAMP:20260101T120000Z
DTSTART;VALUE=DATE:20261101
SUMMARY:Fall Back Day
END:VEVENT
END:VCALENDAR`;

    for (const hostTimezone of ["UTC", "America/Los_Angeles", "Pacific/Honolulu"]) {
      vi.stubEnv("TZ", hostTimezone);
      const result = parseICalResult(calendar);
      expect(result.valid, hostTimezone).toBe(true);
      if (!result.valid) continue;

      expect(
        result.events.map(({ uid, startsAtUtc, endsAtUtc }) => ({
          uid,
          startsAtUtc,
          endsAtUtc,
        })),
        hostTimezone,
      ).toEqual([
        {
          uid: "spring-forward",
          startsAtUtc: "2026-03-08T05:00:00.000Z",
          endsAtUtc: "2026-03-09T04:00:00.000Z",
        },
        {
          uid: "fall-back",
          startsAtUtc: "2026-11-01T04:00:00.000Z",
          endsAtUtc: "2026-11-02T05:00:00.000Z",
        },
      ]);
    }
  });
});
