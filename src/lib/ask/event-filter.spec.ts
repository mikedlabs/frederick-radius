import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import { parseAskIntent } from "./intent";
import { eventFitsAskIntent, eventFitsTonightWindow } from "./event-filter";

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

  it("keeps tonight to real evening occurrences, not broad daytime rows", () => {
    const afternoon = new Date("2026-08-13T18:20:00.000Z"); // 2:20 PM Eastern
    const intent = parseAskIntent("What should I do tonight?", afternoon);
    const aliveAtFive = event("2026-08-13T21:00:00Z", "2026-08-14T00:00:00Z");
    const endingBeforeEvening = event("2026-08-13T14:00:00Z", "2026-08-13T19:00:00Z");
    const suspiciousDaylong = event("2026-08-13T14:00:00Z", "2026-08-14T02:45:00Z");
    const allDay = {
      ...event("2026-08-13T04:00:00Z", "2026-08-14T04:00:00Z"),
      is_all_day: true,
    };

    expect(eventFitsAskIntent(aliveAtFive, intent, afternoon)).toBe(true);
    expect(eventFitsAskIntent(endingBeforeEvening, intent, afternoon)).toBe(false);
    expect(eventFitsAskIntent(suspiciousDaylong, intent, afternoon)).toBe(false);
    expect(eventFitsAskIntent(allDay, intent, afternoon)).toBe(false);
    expect(eventFitsTonightWindow(aliveAtFive, afternoon)).toBe(true);
  });

  it("keeps an explicit tonight clock inside its requested window", () => {
    const afternoon = new Date("2026-08-13T18:20:00.000Z"); // 2:20 PM Eastern
    const intent = parseAskIntent(
      "What events are happening at 7 tonight?",
      afternoon,
    );
    const fourPm = event("2026-08-13T20:00:00Z", "2026-08-13T22:00:00Z");
    const sevenPm = event("2026-08-13T23:00:00Z", "2026-08-14T01:00:00Z");
    const tenPm = event("2026-08-14T02:00:00Z", "2026-08-14T03:30:00Z");

    expect(intent.requestedDateTime).toBe("2026-08-13T23:00:00.000Z");
    expect(eventFitsAskIntent(fourPm, intent, afternoon)).toBe(false);
    expect(eventFitsAskIntent(sevenPm, intent, afternoon)).toBe(true);
    expect(eventFitsAskIntent(tenPm, intent, afternoon)).toBe(false);
  });

  it.each([
    "What events are happening at 1am tonight?",
    "What events are happening after midnight tonight?",
  ])("keeps an explicit overnight event inside tonight for %s", (query) => {
    const afternoon = new Date("2026-08-13T18:20:00.000Z");
    const intent = parseAskIntent(query, afternoon);
    const oneAm = event("2026-08-14T05:00:00Z", "2026-08-14T06:30:00Z");

    expect(intent.requestedDate).toBe("2026-08-14");
    expect(eventFitsAskIntent(oneAm, intent, afternoon, query)).toBe(true);
  });

  it("does not let explicit overnight wording bypass occurrence quality", () => {
    const afternoon = new Date("2026-08-13T18:20:00.000Z");
    const query = "What events are happening at 1am tonight?";
    const intent = parseAskIntent(query, afternoon);
    const allDay = {
      ...event("2026-08-14T04:00:00Z", "2026-08-15T04:00:00Z"),
      is_all_day: true,
    };
    const genericDayRange = {
      ...event("2026-08-14T04:00:00Z", "2026-08-14T16:00:00Z"),
      title: "Generic program window",
      description: "Program availability",
      category: "family",
    };
    const multiDayRange = event(
      "2026-08-13T16:00:00Z",
      "2026-08-15T16:00:00Z",
    );

    expect(eventFitsAskIntent(allDay, intent, afternoon, query)).toBe(false);
    expect(eventFitsAskIntent(genericDayRange, intent, afternoon, query)).toBe(false);
    expect(eventFitsAskIntent(multiDayRange, intent, afternoon, query)).toBe(false);
  });

  it("keeps a real ten-hour flagship event that runs into the evening", () => {
    const afternoon = new Date("2026-09-12T18:00:00.000Z"); // 2 PM Eastern
    const intent = parseAskIntent("What should I do tonight?", afternoon);
    const inTheStreets = {
      ...event("2026-09-12T15:00:00Z", "2026-09-13T01:00:00Z"),
      title: "In the Streets",
      description: "Downtown's signature one-day street festival.",
      category: "arts",
    };

    expect(eventFitsAskIntent(inTheStreets, intent, afternoon)).toBe(true);
    expect(eventFitsTonightWindow(inTheStreets, afternoon)).toBe(true);
  });

  it("keeps a legitimate timed event that is already live into the evening", () => {
    const sixPm = new Date("2026-08-13T22:00:00.000Z");
    const startedAtThree = event("2026-08-13T19:00:00Z", "2026-08-14T00:00:00Z");

    expect(eventFitsTonightWindow(startedAtThree, sixPm)).toBe(true);
  });
});
