/**
 * All-day event correctness. Two coupled bugs: all-day iCal rows parsed to UTC
 * midnight (the prior evening in ET, so they listed a day early) and
 * eventDateBlock always formatted a clock (printing a bogus "12:00 AM"). The
 * fix anchors all-day rows to ET noon and makes eventDateBlock return "All
 * day". This guards both: the day-of-week/day land on the intended ET date,
 * and no fabricated time is shown.
 */
import { describe, it, expect } from "vitest";
import { eventDateBlock } from "@/lib/loaders/events";
import { easternWallToUtcISO } from "@/lib/tz";
import type { Event } from "@/data/events";

const ev = (o: Partial<Event>): Event => o as Event;

describe("eventDateBlock — all-day handling", () => {
  it("returns 'All day' for an all-day event (never a fabricated clock)", () => {
    const b = eventDateBlock(ev({ starts_at: "2026-07-04T16:00:00.000Z", is_all_day: true }));
    expect(b.time).toBe("All day");
  });

  it("formats a real clock for a timed event", () => {
    // 2026-07-04T16:00Z = 12:00 PM ET
    const b = eventDateBlock(ev({ starts_at: "2026-07-04T16:00:00.000Z", is_all_day: false }));
    expect(b.time).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)$/i);
  });

  it("an ET-noon-anchored all-day instant lands on the intended Eastern day", () => {
    // The pipeline anchors all-day DTSTART (UTC midnight) to ET noon via this
    // exact call; assert the rendered day matches the calendar date, not the
    // day-before that UTC midnight would have shown in Eastern time.
    const iso = easternWallToUtcISO(2026, 7, 4, 12, 0);
    const b = eventDateBlock(ev({ starts_at: iso, is_all_day: true }));
    expect(b.month).toBe("JUL");
    expect(b.day).toBe("4");
    expect(b.weekday).toBe("Sat");
  });
});
