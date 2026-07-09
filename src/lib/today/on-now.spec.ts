import { describe, it, expect } from "vitest";
import {
  pickLiveEvent,
  pickNextDraw,
  pickLivePour,
  selectOnNowChips,
  NEXT_DRAW_WINDOW_MIN,
  type OnNowEvent,
} from "./on-now";

/**
 * The strip's event slot is a DRAW slot (the July audit caught a DCFS
 * office-hours row headlining "LIVE NOW"): utility/civic business and routine
 * standing programs never chip, live or not, and when no draw is live the
 * slot falls back to the next draw starting soon with an honest countdown
 * kicker instead of a live claim.
 */

const NOW = new Date("2026-07-09T22:00:00Z"); // 6:00 PM Eastern

/** ISO string N minutes from NOW. */
function inMin(n: number): string {
  return new Date(NOW.getTime() + n * 60_000).toISOString();
}

function ev(p: Partial<OnNowEvent> & { title: string }): OnNowEvent {
  // Started 30 min ago, ends in 90 — live at NOW unless overridden.
  return { slug: "e", starts_at: inMin(-30), ends_at: inMin(90), ...p };
}

describe("pickLiveEvent", () => {
  it("never headlines utility/civic business, even when it is the only live row", () => {
    const council = ev({ title: "City Council Meeting" });
    expect(pickLiveEvent([council], NOW)).toBeNull();
    expect(pickLiveEvent([ev({ title: "Budget Hearing", category: "civic" })], NOW)).toBeNull();
  });

  it("never headlines a routine standing program (the DCFS / storytime class)", () => {
    expect(pickLiveEvent([ev({ title: "DCFS Family Support Specialist" })], NOW)).toBeNull();
    expect(pickLiveEvent([ev({ title: "Family Storytime" })], NOW)).toBeNull();
    expect(pickLiveEvent([ev({ title: "ESL Conversation Classes" })], NOW)).toBeNull();
  });

  it("a live draw beats live utility + routine rows", () => {
    const concert = ev({ slug: "show", title: "Bluegrass on the Creek" });
    const picked = pickLiveEvent(
      [ev({ title: "Planning Commission Meeting" }), ev({ title: "Toddler Time" }), concert],
      NOW,
    );
    expect(picked).toBe(concert);
  });

  it("ranks live draws with compareForLead (imagery first, then soonest)", () => {
    const plain = ev({ slug: "plain", title: "Farmers Market Pop-up", starts_at: inMin(-60) });
    const photo = ev({ slug: "photo", title: "Sky Stage Show", hero_image: "p.jpg", starts_at: inMin(-10) });
    expect(pickLiveEvent([plain, photo], NOW)).toBe(photo);
  });

  it("rejects future, ended, and all-day rows (the shared live gate)", () => {
    expect(pickLiveEvent([ev({ title: "Concert", starts_at: inMin(10), ends_at: inMin(120) })], NOW)).toBeNull();
    expect(pickLiveEvent([ev({ title: "Concert", starts_at: inMin(-180), ends_at: inMin(-30) })], NOW)).toBeNull();
    expect(pickLiveEvent([ev({ title: "Concert", is_all_day: true })], NOW)).toBeNull();
  });
});

describe("pickNextDraw", () => {
  it("returns the soonest-starting draw inside the window, with real minutes", () => {
    const later = ev({ slug: "later", title: "Trivia Showdown", starts_at: inMin(75), ends_at: inMin(180) });
    const sooner = ev({ slug: "sooner", title: "Open Mic Night", starts_at: inMin(25), ends_at: inMin(120) });
    const next = pickNextDraw([later, sooner], NOW);
    expect(next?.event).toBe(sooner);
    expect(next?.startsInMin).toBe(25);
  });

  it("skips utility, routine, all-day, and already-started rows", () => {
    const pool = [
      ev({ title: "Town Council Meeting", starts_at: inMin(15), ends_at: inMin(120) }),
      ev({ title: "Family Storytime", starts_at: inMin(20), ends_at: inMin(60) }),
      ev({ title: "Art Walk", is_all_day: true, starts_at: inMin(30) }),
      ev({ title: "Live Jazz", starts_at: inMin(-5), ends_at: inMin(120) }), // already started
    ];
    expect(pickNextDraw(pool, NOW)).toBeNull();
  });

  it("looks no further than the window", () => {
    const far = ev({ title: "Late Show", starts_at: inMin(NEXT_DRAW_WINDOW_MIN + 1), ends_at: inMin(240) });
    expect(pickNextDraw([far], NOW)).toBeNull();
    const edge = ev({ title: "Late Show", starts_at: inMin(NEXT_DRAW_WINDOW_MIN), ends_at: inMin(240) });
    expect(pickNextDraw([edge], NOW)?.startsInMin).toBe(NEXT_DRAW_WINDOW_MIN);
  });

  it("never reads 'Starts in 0 min' (floors at 1)", () => {
    const imminent = ev({ title: "Concert", starts_at: inMin(0.2), ends_at: inMin(120) });
    expect(pickNextDraw([imminent], NOW)?.startsInMin).toBe(1);
  });
});

describe("selectOnNowChips — event slot", () => {
  it("a live draw chips as 'Live now' and carries the live flag", () => {
    const chips = selectOnNowChips({
      now: NOW,
      events: [ev({ slug: "show", title: "Bluegrass on the Creek", venue_name: "Sky Stage" })],
      pours: [],
      markets: [],
    });
    expect(chips).toEqual([
      {
        kind: "event",
        href: "/events/show",
        kicker: "Live now",
        title: "Bluegrass on the Creek",
        meta: "Sky Stage",
        live: true,
      },
    ]);
  });

  it("falls back to the next-starting draw with a countdown kicker, no live claim", () => {
    const chips = selectOnNowChips({
      now: NOW,
      events: [
        ev({ title: "City Council Meeting" }), // live, but utility
        ev({ slug: "openmic", title: "Open Mic Night", venue_name: "Olde Mother", starts_at: inMin(25), ends_at: inMin(120) }),
      ],
      pours: [],
      markets: [],
    });
    expect(chips).toHaveLength(1);
    expect(chips[0].kicker).toBe("Starts in 25 min");
    expect(chips[0].href).toBe("/events/openmic");
    expect(chips[0].live).toBeUndefined();
  });

  it("drops the event chip entirely when nothing qualifies (honest empty)", () => {
    const chips = selectOnNowChips({
      now: NOW,
      events: [ev({ title: "Zoning Public Hearing" })],
      pours: [],
      markets: [],
    });
    expect(chips).toEqual([]);
  });

  it("place + market chips still assemble in reading order after the event", () => {
    const chips = selectOnNowChips({
      now: NOW,
      events: [ev({ slug: "show", title: "Bluegrass on the Creek" })],
      pours: [{ slug: "bentztown", name: "Bentztown", endsAt: 19 * 60, lastCall: false }],
      markets: [{ name: "Everedy Square & Shab Row", hours: "3 to 6 PM" }],
    });
    expect(chips.map((c) => c.kind)).toEqual(["event", "place", "market"]);
    expect(chips[1].kicker).toBe("Open now");
    expect(chips[2].kicker).toBe("Market today");
  });
});

describe("pickLivePour", () => {
  it("last call outranks a longer-running pour", () => {
    const pours = [
      { slug: "a", name: "A", endsAt: 18 * 60, lastCall: false },
      { slug: "b", name: "B", endsAt: 23 * 60, lastCall: true },
    ];
    expect(pickLivePour(pours)?.slug).toBe("b");
  });
});
