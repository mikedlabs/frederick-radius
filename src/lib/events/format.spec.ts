import { describe, it, expect } from "vitest";
import { eventDateBlock, formatEventWhen } from "./format";
import type { Event } from "@/data/events";

const base = (over: Partial<Event>): Event =>
  ({
    slug: "x",
    title: "X",
    starts_at: "2026-01-29T17:00:00.000Z",
    ends_at: "2026-01-29T19:00:00.000Z",
    ...over,
  }) as Event;

describe("formatEventWhen", () => {
  it("treats an evening event that crosses UTC midnight as ONE Eastern day", () => {
    // 8-10 PM ET on Jul 7 = 00:00Z-02:00Z on Jul 8: the old toDateString()
    // comparison (server-local/UTC) rendered "Tue, Jul 7 – Tue, Jul 7".
    const when = formatEventWhen(
      base({
        starts_at: "2026-07-07T20:00:00-04:00",
        ends_at: "2026-07-07T22:00:00-04:00",
      }),
    );
    expect(when).toBe("Tue, Jul 7 · 8:00 PM–10:00 PM");
  });

  it("prints 'All day' for a one-day event with an exclusive next-midnight end", () => {
    const when = formatEventWhen(
      base({
        starts_at: "2026-07-07T04:00:00.000Z",
        ends_at: "2026-07-08T04:00:00.000Z",
        is_all_day: true,
      }),
    );
    expect(when).toBe("Tue, Jul 7 · All day");
  });

  it("prints the last included day for a multi-day event with an exclusive end", () => {
    const when = formatEventWhen(
      base({
        starts_at: "2026-07-07T04:00:00.000Z",
        ends_at: "2026-07-10T04:00:00.000Z",
        is_all_day: true,
      }),
    );
    expect(when).toBe("Tue, Jul 7 – Thu, Jul 9");
  });

  it("prints the known start time when a feed has no duration", () => {
    const when = formatEventWhen(
      base({
        starts_at: "2026-07-07T14:00:00.000Z",
        ends_at: "2026-07-07T14:00:00.000Z",
      }),
    );
    expect(when).toBe("Tue, Jul 7 · 10:00 AM");
  });

  it("does not present an end-of-day sentinel as a real end time", () => {
    const when = formatEventWhen(
      base({
        starts_at: "2026-07-30T09:15:00-04:00",
        ends_at: "2026-07-30T23:59:00-04:00",
      }),
    );
    expect(when).toBe("Thu, Jul 30 · 9:15 AM");
  });

  it("treats a noon-to-end-of-day feed row as date-only", () => {
    const event = base({
      starts_at: "2026-07-30T12:00:00-04:00",
      ends_at: "2026-07-30T23:59:59-04:00",
    });
    expect(formatEventWhen(event)).toBe("Thu, Jul 30");
    expect(eventDateBlock(event).time).toBe("Time not listed");
  });

  it("keeps a plausible event range that ends before the sentinel", () => {
    const when = formatEventWhen(
      base({
        starts_at: "2026-07-30T09:15:00-04:00",
        ends_at: "2026-07-30T11:00:00-04:00",
      }),
    );
    expect(when).toBe("Thu, Jul 30 · 9:15 AM–11:00 AM");
  });

  it("keeps a real multi-day range as a date range", () => {
    const when = formatEventWhen(
      base({
        starts_at: "2026-07-07T14:00:00.000Z",
        ends_at: "2026-07-09T20:00:00.000Z",
      }),
    );
    expect(when).toBe("Tue, Jul 7 – Thu, Jul 9");
  });
});

describe("eventDateBlock", () => {
  it("prints the clock time for a normal single event", () => {
    expect(eventDateBlock(base({})).time).toBe("12:00 PM");
  });

  it("prints 'All day' for all-day rows (never a bogus clock)", () => {
    expect(eventDateBlock(base({ is_all_day: true })).time).toBe("All day");
  });

  it("prints the honest range end for a date-range listing", () => {
    // The Jul-2 owner report: a feed's series/exhibit window carried a noon
    // ANCHOR on its first day, so cards printed "Thu JAN 29 · 12:00 PM"
    // months after that date. The time slot now carries the range instead.
    const block = eventDateBlock(
      base({ ends_at: "2026-07-31T03:59:59.000Z" }),
    );
    expect(block.time).toBe("through Jul 30");
    // The date plate still states the factual range START.
    expect(block.month).toBe("JAN");
    expect(block.day).toBe("29");
  });
});
