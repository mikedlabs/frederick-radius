import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import { parseAskIntent } from "./intent";
import { eventFitsAskIntent } from "./event-filter";

function event(starts_at: string, ends_at: string): Event {
  return { starts_at, ends_at, is_free: false } as Event;
}

describe("eventFitsAskIntent", () => {
  const now = new Date("2026-07-18T23:00:00.000Z"); // 7 PM Eastern

  it("makes right now mean active, not merely listed today", () => {
    const intent = parseAskIntent("events right now", now);
    expect(eventFitsAskIntent(event("2026-07-18T22:00:00Z", "2026-07-19T00:00:00Z"), intent, now)).toBe(true);
    expect(eventFitsAskIntent(event("2026-07-19T01:00:00Z", "2026-07-19T02:00:00Z"), intent, now)).toBe(false);
    expect(eventFitsAskIntent(event("2026-07-18T19:00:00Z", "2026-07-18T22:00:00Z"), intent, now)).toBe(false);
  });

  it("respects an explicit weekday and time", () => {
    const intent = parseAskIntent("events Monday at 7 PM", now);
    expect(eventFitsAskIntent(event("2026-07-20T23:00:00Z", "2026-07-21T01:00:00Z"), intent, now)).toBe(true);
    expect(eventFitsAskIntent(event("2026-07-20T16:00:00Z", "2026-07-20T18:00:00Z"), intent, now)).toBe(false);
  });

  it("does not turn an in-progress series range into a dated occurrence", () => {
    const intent = parseAskIntent("anything fun tomorrow night", now);
    const range = event("2026-06-26T16:00:00Z", "2026-09-18T16:00:00Z");
    const evening = event("2026-07-19T22:30:00Z", "2026-07-20T00:30:00Z");
    const matinee = event("2026-07-19T17:00:00Z", "2026-07-19T19:00:00Z");

    expect(eventFitsAskIntent(range, intent, now, "anything fun tomorrow night")).toBe(false);
    expect(eventFitsAskIntent(evening, intent, now, "anything fun tomorrow night")).toBe(true);
    expect(eventFitsAskIntent(matinee, intent, now, "anything fun tomorrow night")).toBe(false);
  });
});
