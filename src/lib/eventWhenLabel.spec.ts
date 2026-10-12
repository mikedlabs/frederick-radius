import { describe, it, expect } from "vitest";
import {
  ASSUMED_RUNTIME_MS,
  effectiveTimedEventEndMs,
  eventHasEndOfDaySentinel,
  eventHasTrustworthyEnd,
  isDateOnlyEventAnchor,
  isEventEnded,
  isEventLiveNow,
  MAX_LIVE_SESSION_MS,
  startedEventTimingDisclosure,
} from "./eventWhenLabel";

// All fixtures are in Eastern Daylight Time (July, -04:00) so the day math is
// unambiguous. The bug these guard: isEventEnded trusted an inflated feed end
// verbatim while isEventLiveNow capped it, so a 1-4 PM show tagged "ends
// 11:59 PM" rode the /today live rail all evening ("Down Time Duo", owner
// catch Jul 2026).

const at = (iso: string) => new Date(iso);
const H = 3_600_000;

describe("isEventEnded — the /today 'is it over?' floor", () => {
  it("treats an 11:59 PM stamp as no end and applies the assumed runtime", () => {
    // 1 PM show the feed stamped as ending 11:59 PM.
    const e = { starts_at: "2026-07-12T13:00:00-04:00", ends_at: "2026-07-12T23:59:00-04:00" };
    expect(isEventEnded(e, at("2026-07-12T15:00:00-04:00"))).toBe(false); // 3 PM
    expect(isEventEnded(e, at("2026-07-12T16:00:01-04:00"))).toBe(true); // past 1 PM + 3h
  });

  it("caps an inflated stated end that is not a placeholder at MAX_LIVE_SESSION_MS", () => {
    // A venue-close stamp: 1 PM to 11:30 PM is a stated end, not the
    // 11:59 PM placeholder, so the eight-hour session cap is what bounds it.
    const e = { starts_at: "2026-07-12T13:00:00-04:00", ends_at: "2026-07-12T23:30:00-04:00" };
    const start = Date.parse(e.starts_at);
    expect(isEventEnded(e, new Date(start + MAX_LIVE_SESSION_MS - H))).toBe(false); // 8 PM
    expect(isEventEnded(e, new Date(start + MAX_LIVE_SESSION_MS + H))).toBe(true); // 10 PM
  });

  it("trusts an honest end that is within a plausible session", () => {
    const e = { starts_at: "2026-07-12T13:00:00-04:00", ends_at: "2026-07-12T16:00:00-04:00" };
    expect(isEventEnded(e, at("2026-07-12T14:00:00-04:00"))).toBe(false); // 2 PM, still on
    expect(isEventEnded(e, at("2026-07-12T16:30:00-04:00"))).toBe(true); // 4:30 PM, over
  });

  it("gives a no-end event a 3h grace, then ends it", () => {
    const e = { starts_at: "2026-07-12T19:00:00-04:00" }; // 7 PM, no ends_at
    expect(ASSUMED_RUNTIME_MS).toBe(3 * H);
    expect(isEventEnded(e, at("2026-07-12T19:30:00-04:00"))).toBe(false); // 7:30, grace
    expect(isEventEnded(e, at("2026-07-12T21:30:00-04:00"))).toBe(false); // 9:30, grace
    expect(isEventEnded(e, at("2026-07-12T22:30:00-04:00"))).toBe(true); // 10:30, past 3h
  });

  it("ends an all-day event only after its Eastern calendar day, never mid-day", () => {
    const today = { starts_at: "2026-07-12T00:00:00-04:00", is_all_day: true };
    expect(isEventEnded(today, at("2026-07-12T22:00:00-04:00"))).toBe(false); // 10 PM same day
    const yesterday = { starts_at: "2026-07-11T00:00:00-04:00", is_all_day: true };
    expect(isEventEnded(yesterday, at("2026-07-12T09:00:00-04:00"))).toBe(true);
  });
});

describe("isEventLiveNow — evidence floor", () => {
  const e = { starts_at: "2026-07-12T13:00:00-04:00", ends_at: "2026-07-12T16:00:00-04:00" };
  for (const iso of [
    "2026-07-12T14:00:00-04:00", // 2 PM, within cap
    "2026-07-12T15:30:00-04:00", // 3:30 PM, before the confirmed end
    "2026-07-12T16:30:00-04:00", // 4:30 PM, after the confirmed end
  ]) {
    it(`a confirmed-end event is never both live and ended at ${iso}`, () => {
      const now = at(iso);
      expect(isEventLiveNow(e, now)).toBe(!isEventEnded(e, now));
    });
  }

  it("keeps an unknown-end event briefly discoverable without calling it live", () => {
    const unknownEnd = { starts_at: "2026-07-12T13:00:00-04:00" };
    const now = at("2026-07-12T14:00:00-04:00");
    expect(isEventEnded(unknownEnd, now)).toBe(false);
    expect(isEventLiveNow(unknownEnd, now)).toBe(false);
  });

  it("does not trust an end-of-day sentinel as a live end", () => {
    const sentinel = {
      starts_at: "2026-07-12T09:15:00-04:00",
      ends_at: "2026-07-12T23:59:00-04:00",
    };
    expect(isEventLiveNow(sentinel, at("2026-07-12T11:00:00-04:00"))).toBe(false);
  });

  it("all-day events are never live-now", () => {
    const today = { starts_at: "2026-07-12T00:00:00-04:00", is_all_day: true };
    expect(isEventLiveNow(today, at("2026-07-12T12:00:00-04:00"))).toBe(false);
  });
});

// UI audit, Oct 2026: civic meetings showed invented end times and stayed
// current all evening. October 2026 is EDT (-04:00); Oct 6 is a Tuesday and
// Oct 11 is a Sunday.
describe("end-of-day placeholder ends", () => {
  const councilLegislativeDay = {
    title: "Council Legislative Day",
    starts_at: "2026-10-06T17:30:00-04:00",
    ends_at: "2026-10-06T23:59:00-04:00",
  };
  const ethicsCommissionMeeting = {
    title: "Ethics Commission Meeting",
    starts_at: "2026-10-06T18:30:00-04:00",
    ends_at: "2026-10-06T23:59:00-04:00",
  };
  const kidCreatorFallMarket = {
    title: "Kid Creator Fall Market",
    starts_at: "2026-10-11T12:00:00-04:00",
    ends_at: "2026-10-12T00:59:00-04:00",
  };

  it("treats a same-day 11:59 PM end as no end time, whatever the duration", () => {
    expect(eventHasEndOfDaySentinel(councilLegislativeDay)).toBe(true);
    expect(eventHasEndOfDaySentinel(ethicsCommissionMeeting)).toBe(true);
    expect(eventHasTrustworthyEnd(councilLegislativeDay)).toBe(false);
    expect(eventHasTrustworthyEnd(ethicsCommissionMeeting)).toBe(false);
    // 11:58 PM is the same placeholder.
    expect(
      eventHasEndOfDaySentinel({
        starts_at: "2026-10-06T21:00:00-04:00",
        ends_at: "2026-10-06T23:58:00-04:00",
      }),
    ).toBe(true);
  });

  it("treats a next-day 12:59 AM end as the same placeholder written an hour late", () => {
    expect(eventHasEndOfDaySentinel(kidCreatorFallMarket)).toBe(true);
    expect(eventHasTrustworthyEnd(kidCreatorFallMarket)).toBe(false);
    // The shifted form says the offset is wrong, so its noon start is kept
    // as a clock rather than read as a date-only anchor.
    expect(isDateOnlyEventAnchor(kidCreatorFallMarket)).toBe(false);
  });

  it("keeps real late ends", () => {
    for (const ends_at of [
      "2026-10-06T23:30:00-04:00", // 11:30 PM
      "2026-10-07T00:00:00-04:00", // midnight
      "2026-10-07T00:30:00-04:00", // 12:30 AM
      "2026-10-07T01:30:00-04:00", // 1:30 AM
    ]) {
      const e = { starts_at: "2026-10-06T20:00:00-04:00", ends_at };
      expect(eventHasEndOfDaySentinel(e)).toBe(false);
      expect(eventHasTrustworthyEnd(e)).toBe(true);
    }
    // A 12:59 AM end two days later is a span, not a shifted placeholder.
    expect(
      eventHasEndOfDaySentinel({
        starts_at: "2026-10-06T20:00:00-04:00",
        ends_at: "2026-10-08T00:59:00-04:00",
      }),
    ).toBe(false);
    expect(
      eventHasEndOfDaySentinel({ ...councilLegislativeDay, is_all_day: true }),
    ).toBe(false);
  });

  it("still reads noon plus a same-day 11:59 PM end as a date-only anchor", () => {
    expect(
      isDateOnlyEventAnchor({
        starts_at: "2026-10-06T12:00:00-04:00",
        ends_at: "2026-10-06T23:59:00-04:00",
      }),
    ).toBe(true);
    expect(isDateOnlyEventAnchor(councilLegislativeDay)).toBe(false);
  });

  it("does not keep a 5:30 PM hearing current at 10:50 PM", () => {
    const tenFifty = at("2026-10-06T22:50:00-04:00");
    expect(isEventEnded(councilLegislativeDay, tenFifty)).toBe(true);
    expect(isEventLiveNow(councilLegislativeDay, tenFifty)).toBe(false);
    expect(effectiveTimedEventEndMs(councilLegislativeDay)).toBe(
      Date.parse("2026-10-06T20:30:00-04:00"),
    );
  });

  it("keeps a started meeting visible for 3 hours without calling it live", () => {
    const sevenPm = at("2026-10-06T19:00:00-04:00");
    expect(isEventEnded(councilLegislativeDay, sevenPm)).toBe(false);
    expect(isEventLiveNow(councilLegislativeDay, sevenPm)).toBe(false);
    expect(startedEventTimingDisclosure(councilLegislativeDay, sevenPm)).toBe(
      "Started at 5:30 PM · end time unavailable",
    );
    expect(isEventEnded(ethicsCommissionMeeting, at("2026-10-06T21:29:00-04:00"))).toBe(false);
    expect(isEventEnded(ethicsCommissionMeeting, at("2026-10-06T21:31:00-04:00"))).toBe(true);
  });

  it("ends the Kid Creator Fall Market 3 hours after its start, not after midnight", () => {
    expect(isEventEnded(kidCreatorFallMarket, at("2026-10-11T14:30:00-04:00"))).toBe(false);
    expect(isEventEnded(kidCreatorFallMarket, at("2026-10-11T15:00:01-04:00"))).toBe(true);
    expect(isEventLiveNow(kidCreatorFallMarket, at("2026-10-11T13:00:00-04:00"))).toBe(false);
  });

  it("keeps a date-only anchor in its capped listing window", () => {
    const anchor = {
      starts_at: "2026-10-06T12:00:00-04:00",
      ends_at: "2026-10-06T23:59:00-04:00",
    };
    expect(isEventEnded(anchor, at("2026-10-06T16:00:00-04:00"))).toBe(false);
    expect(effectiveTimedEventEndMs(anchor)).toBe(
      Date.parse(anchor.starts_at) + MAX_LIVE_SESSION_MS,
    );
  });
});
