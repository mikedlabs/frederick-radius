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

  it("parses folded text, a canonical URL, and a Frederick wall-clock time", () => {
    const result = parseICalResult(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:alive-at-five
DTSTAMP:20260727T120000Z
DTSTART;TZID=America/New_York:20260730T170000
DTEND;TZID=America/New_York:20260730T200000
SUMMARY:Alive @ Five
DESCRIPTION:Music on Carroll Creek\\, rain or shine. This sentence is
 folded across two source lines.
LOCATION:Carroll Creek Amphitheater\\, Frederick\\, MD
URL:https://www.example.com/alive-at-five
END:VEVENT
END:VCALENDAR`);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.events).toEqual([
      expect.objectContaining({
        uid: "alive-at-five",
        summary: "Alive @ Five",
        description:
          "Music on Carroll Creek, rain or shine. This sentence isfolded across two source lines.",
        rawLocation: "Carroll Creek Amphitheater, Frederick, MD",
        sourceUrl: "https://www.example.com/alive-at-five",
        startsAtUtc: "2026-07-30T21:00:00.000Z",
        endsAtUtc: "2026-07-31T00:00:00.000Z",
        tzid: "America/New_York",
        allDay: false,
        dtstamp: "2026-07-27T12:00:00.000Z",
      }),
    ]);
    expect(result.events[0]?.rawVevent).toContain("BEGIN:VEVENT");
    expect(result.events[0]?.rawVevent).toContain("END:VEVENT");
  });

  it("parses explicit numeric offsets without changing the represented instant", () => {
    const result = parseICalResult(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:offset-event
DTSTART:20260730T170000-0400
SUMMARY:Offset Event
END:VEVENT
END:VCALENDAR`);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.events[0]?.startsAtUtc).toBe("2026-07-30T21:00:00.000Z");
    expect(result.events[0]?.tzid).toBe("UTC-04:00");
    expect(result.events[0]?.dtstamp).toBe("2026-07-30T21:00:00.000Z");
  });

  it("uses CivicPlus's absolute event page instead of its relative calendar URL", () => {
    const result = parseICalResult(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:22352
DTSTART;TZID=America/New_York:20260730T170000
SUMMARY:City meeting
DESCRIPTION: https://www.cityoffrederickmd.gov/calendar.aspx?EID=22352
URL:/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=14
END:VEVENT
END:VCALENDAR`);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.events[0]?.sourceUrl).toBe(
      "https://www.cityoffrederickmd.gov/calendar.aspx?EID=22352",
    );
  });

  it("respects explicit UTC and other IANA TZIDs", () => {
    const result = parseICalResult(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:utc-event
DTSTART;TZID=UTC:20260730T170000
SUMMARY:UTC Event
END:VEVENT
BEGIN:VEVENT
UID:chicago-event
DTSTART;TZID=America/Chicago:20260730T170000
SUMMARY:Chicago Event
END:VEVENT
END:VCALENDAR`);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.events.map(({ uid, startsAtUtc, tzid }) => ({
      uid,
      startsAtUtc,
      tzid,
    }))).toEqual([
      {
        uid: "utc-event",
        startsAtUtc: "2026-07-30T17:00:00.000Z",
        tzid: "UTC",
      },
      {
        uid: "chicago-event",
        startsAtUtc: "2026-07-30T22:00:00.000Z",
        tzid: "America/Chicago",
      },
    ]);
  });

  it("uses an all-day event's declared zone for its implicit exclusive end", () => {
    const result = parseICalResult(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:chicago-all-day
DTSTART;VALUE=DATE;TZID=America/Chicago:20261101
SUMMARY:Chicago All Day
END:VEVENT
END:VCALENDAR`);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.events[0]).toMatchObject({
      startsAtUtc: "2026-11-01T05:00:00.000Z",
      endsAtUtc: "2026-11-02T06:00:00.000Z",
      tzid: "America/Chicago",
      allDay: true,
    });
  });

  it("rejects impossible dates instead of silently rolling them forward", () => {
    const result = parseICalResult(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:impossible
DTSTART:20260230T120000Z
SUMMARY:Impossible Date
END:VEVENT
END:VCALENDAR`);

    expect(result).toEqual({
      valid: false,
      events: [],
      error: "calendar contained no usable VEVENTs",
    });
  });

  it("parses content lines whose quoted parameters contain colons", () => {
    const result = parseICalResult(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:quoted-parameter
DTSTART:20260730T210000Z
SUMMARY:Quoted Parameter
DESCRIPTION;ALTREP="CID:part3.msg.970415T083000@example.com":Project review
END:VEVENT
END:VCALENDAR`);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.events[0]?.description).toBe("Project review");
  });

  it("rejects an unterminated VEVENT instead of reporting an empty calendar", () => {
    expect(parseICalResult(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:unfinished
DTSTART:20260730T210000Z
SUMMARY:Unfinished
END:VCALENDAR`)).toEqual({
      valid: false,
      events: [],
      error: "malformed VEVENT structure",
    });
  });
});
