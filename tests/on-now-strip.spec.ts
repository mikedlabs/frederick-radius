import { describe, it, expect } from "vitest";
import {
  selectOnNowChips,
  pickLiveEvent,
  pickLivePour,
  type OnNowEvent,
  type OnNowPour,
} from "@/lib/today/on-now";

// A fixed "now" in America/New_York evening: 2026-07-08 20:00 EDT.
const NOW = new Date("2026-07-09T00:00:00Z"); // = Jul 8 20:00 EDT

const liveEvent: OnNowEvent = {
  slug: "olde-mother-live",
  title: "Live music at Olde Mother",
  venue_name: "Olde Mother Brewing",
  starts_at: "2026-07-08T23:30:00Z", // 19:30 EDT, on now
  ends_at: "2026-07-09T02:00:00Z", // 22:00 EDT
};
const endedEvent: OnNowEvent = {
  slug: "afternoon-craft",
  title: "Library craft",
  starts_at: "2026-07-08T18:00:00Z", // 14:00 EDT
  ends_at: "2026-07-08T20:00:00Z", // 16:00 EDT, over
};
const futureEvent: OnNowEvent = {
  slug: "late-show",
  title: "Late show",
  starts_at: "2026-07-09T03:00:00Z", // 23:00 EDT, not started
};
const allDayEvent: OnNowEvent = {
  slug: "senior-yoga",
  title: "Senior yoga",
  starts_at: "2026-07-08T13:00:00Z",
  is_all_day: true,
};

describe("pickLiveEvent", () => {
  it("returns only an event that is live this minute", () => {
    expect(pickLiveEvent([endedEvent, liveEvent, futureEvent], NOW)?.slug).toBe("olde-mother-live");
  });
  it("rejects ended, future, and all-day events", () => {
    expect(pickLiveEvent([endedEvent, futureEvent, allDayEvent], NOW)).toBeNull();
  });
});

describe("pickLivePour", () => {
  it("prefers last call, then the pour ending soonest", () => {
    const pours: OnNowPour[] = [
      { slug: "a", name: "A", endsAt: 22 * 60, lastCall: false },
      { slug: "b", name: "B", endsAt: 23 * 60, lastCall: true },
      { slug: "c", name: "C", endsAt: 21 * 60, lastCall: false },
    ];
    expect(pickLivePour(pours)?.slug).toBe("b");
  });
  it("with no last call, takes the soonest to end", () => {
    const pours: OnNowPour[] = [
      { slug: "a", name: "A", endsAt: 22 * 60, lastCall: false },
      { slug: "c", name: "C", endsAt: 21 * 60, lastCall: false },
    ];
    expect(pickLivePour(pours)?.slug).toBe("c");
  });
  it("returns null when nothing is pouring", () => {
    expect(pickLivePour([])).toBeNull();
  });
});

describe("selectOnNowChips", () => {
  it("builds one chip per live signal, in event → place → market order", () => {
    const chips = selectOnNowChips({
      now: NOW,
      events: [endedEvent, liveEvent],
      pours: [{ slug: "brewers", name: "Brewer's Alley", endsAt: 21 * 60, lastCall: false }],
      markets: [{ name: "Downtown Frederick Market", hours: "3-9 PM" }],
    });
    expect(chips.map((c) => c.kind)).toEqual(["event", "place", "market"]);
    expect(chips[0]).toMatchObject({ href: "/events/olde-mother-live", kicker: "Live now", meta: "Olde Mother Brewing" });
    expect(chips[1]).toMatchObject({ href: "/places/brewers", kicker: "Open now", meta: "till 9 PM" });
    expect(chips[2]).toMatchObject({ href: "/category/market", kicker: "Market today", meta: "3-9 PM" });
  });

  it("drops any slot that has nothing (a market-only day shows one chip)", () => {
    const chips = selectOnNowChips({
      now: NOW,
      events: [endedEvent, futureEvent],
      pours: [],
      markets: [{ name: "Emmitsburg Market", hours: "4-9 PM" }],
    });
    expect(chips).toHaveLength(1);
    expect(chips[0].kind).toBe("market");
  });

  it("labels a last-call pour and a to-close pour honestly", () => {
    const chips = selectOnNowChips({
      now: NOW,
      events: [],
      pours: [{ slug: "x", name: "X", endsAt: 1440, lastCall: false }],
      markets: [],
    });
    expect(chips[0]).toMatchObject({ kicker: "Open now", meta: "till close" });
  });

  it("SELF-HIDES: returns an empty array when nothing is genuinely on now", () => {
    const chips = selectOnNowChips({
      now: NOW,
      events: [endedEvent, futureEvent, allDayEvent],
      pours: [],
      markets: [],
    });
    expect(chips).toEqual([]);
  });
});
