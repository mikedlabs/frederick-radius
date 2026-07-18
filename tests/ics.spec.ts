import { describe, it, expect } from "vitest";
import { buildIcs, buildIcsFeed } from "@/lib/ics";

describe("buildIcs", () => {
  it("emits a valid timed VEVENT with CRLF joins and UTC stamps", () => {
    const ics = buildIcs({
      uid: "first-friday",
      title: "First Friday",
      // 2026-05-17T00:00Z == May 16 2026 8:00 PM EDT.
      starts_at: "2026-05-17T00:00:00Z",
      ends_at: "2026-05-17T03:00:00Z",
      venue_name: "Carroll Creek",
      address: "Frederick, MD",
      url: "https://frederickradius.app/events/first-friday",
    });
    expect(ics).toContain("\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:first-friday@frederickradius.app");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(ics).toContain("DTSTART:20260517T000000Z");
    expect(ics).toContain("DTEND:20260517T030000Z");
    expect(ics).toContain("LOCATION:Carroll Creek\\, Frederick\\, MD");
    expect(ics).toContain("URL:https://frederickradius.app/events/first-friday");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("escapes commas, semicolons, backslashes and newlines (RFC 5545)", () => {
    const ics = buildIcs({
      uid: "x",
      title: "Wine, Cheese; & a\\note",
      starts_at: "2026-06-01T18:00:00Z",
      ends_at: "2026-06-01T20:00:00Z",
      description: "Line one\nLine two",
    });
    expect(ics).toContain("SUMMARY:Wine\\, Cheese\\; & a\\\\note");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("uses a non-inclusive date-only DTEND for a one-day all-day event", () => {
    const ics = buildIcs({
      uid: "fest",
      title: "Frederick Festival",
      // Noon UTC on May 16 is still May 16 in New York.
      starts_at: "2026-05-16T12:00:00Z",
      ends_at: "2026-05-16T23:00:00Z",
      all_day: true,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260516");
    expect(ics).toContain("DTEND;VALUE=DATE:20260517");
    expect(ics).not.toMatch(/DTSTART:\d{8}T/);
  });

  it("spans a multi-day all-day event with DTEND = last day + 1", () => {
    const ics = buildIcs({
      uid: "fair",
      title: "County Fair",
      starts_at: "2026-09-18T12:00:00Z",
      ends_at: "2026-09-20T22:00:00Z",
      all_day: true,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260918");
    expect(ics).toContain("DTEND;VALUE=DATE:20260921");
  });

  it("omits optional lines cleanly when fields are absent", () => {
    const ics = buildIcs({
      uid: "bare",
      title: "Bare Event",
      starts_at: "2026-07-04T16:00:00Z",
      ends_at: "2026-07-04T18:00:00Z",
    });
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("URL:");
  });
});

describe("buildIcsFeed", () => {
  const ev = (uid: string) => ({
    uid,
    title: `Event ${uid}`,
    starts_at: "2026-07-20T22:00:00Z",
    ends_at: "2026-07-21T00:00:00Z",
  });

  it("emits one calendar with a name, refresh hints, and every VEVENT", () => {
    const ics = buildIcsFeed("Frederick County events", [ev("a"), ev("b"), ev("c")]);
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics.match(/END:VCALENDAR/g)).toHaveLength(1);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("X-WR-CALNAME:Frederick County events");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
    expect(ics).toContain("X-PUBLISHED-TTL:PT6H");
    expect(ics).toContain("UID:b@frederickradius.app");
  });

  it("escapes the calendar name like any other TEXT field", () => {
    const ics = buildIcsFeed("Music, markets; more", [ev("a")]);
    expect(ics).toContain("X-WR-CALNAME:Music\\, markets\\; more");
  });

  it("stays a valid empty calendar with zero events", () => {
    const ics = buildIcsFeed("Quiet week", []);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
  });
});
