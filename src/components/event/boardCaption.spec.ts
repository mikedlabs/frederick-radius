import { describe, expect, it } from "vitest";
import {
  buildHorizonBounds,
  groupByHorizon,
  isTonightEvent,
} from "@/lib/eventHorizon";
import {
  activeWhenPreset,
  boardAnswer,
  countLine,
  formatDayLabel,
  isEveningHour,
  isSmallHours,
  nextMastheadCollapsed,
  parseTimeParams,
  PARTIAL_SENTENCE,
  ribbonMonthCaption,
  ribbonSelection,
  rollForwardHeading,
  showMoreLabel,
  tonightPlacement,
  weekDayKeys,
  weekendDayKeys,
  whatCaption,
  whenCaption,
  WHEN_PRESETS,
} from "./boardCaption";

describe("whatCaption", () => {
  it("rests on Everything", () => {
    expect(whatCaption({ goods: [] })).toEqual({ text: "Everything", active: false });
  });
  it("names the intent, and the sub when one is chosen", () => {
    expect(whatCaption({ goods: [], intentLabel: "Music" }).text).toBe("Music");
    expect(
      whatCaption({ goods: [], intentLabel: "Food & drink", subLabel: "Breweries" }).text,
    ).toBe("Breweries");
  });
  it("prefixes the active good-for toggles", () => {
    expect(whatCaption({ goods: ["Free"], intentLabel: "Music" }).text).toBe("Free · Music");
    expect(whatCaption({ goods: ["Free", "Kid-friendly"] }).text).toBe("Free · Kid-friendly");
  });
  it("reads civic as Notices, never inventing a sub", () => {
    expect(whatCaption({ goods: [], civic: true }).text).toBe("Notices");
  });
  it("Music has no subs, so it stays Music", () => {
    // Guards the taxonomy: Music carries no sub, so subLabel is never set.
    expect(whatCaption({ goods: [], intentLabel: "Music", subLabel: null }).text).toBe("Music");
  });
});

describe("whenCaption", () => {
  it("rests on Anytime", () => {
    expect(whenCaption({ dayLabel: null, lens: "all", tod: null })).toEqual({
      text: "Anytime",
      mono: false,
    });
  });
  it("reads the lens window", () => {
    expect(whenCaption({ dayLabel: null, lens: "today", tod: null }).text).toBe("Today");
    expect(whenCaption({ dayLabel: null, lens: "weekend", tod: null }).text).toBe("This weekend");
    expect(whenCaption({ dayLabel: null, lens: "week", tod: null }).text).toBe("Later this week");
  });
  it("reads Tonight and Tomorrow as their own windows", () => {
    expect(whenCaption({ dayLabel: null, lens: "tonight", tod: null }).text).toBe("Tonight");
    expect(whenCaption({ dayLabel: null, lens: "tomorrow", tod: null }).text).toBe("Tomorrow");
    // Today plus a chosen Evening daypart is now just that compound.
    expect(whenCaption({ dayLabel: null, lens: "today", tod: "evening" }).text).toBe("Today · Evening");
  });
  it("composes a standalone daypart and a compound window", () => {
    expect(whenCaption({ dayLabel: null, lens: "all", tod: "morning" }).text).toBe("Morning");
    expect(whenCaption({ dayLabel: null, lens: "today", tod: "morning" }).text).toBe("Today · Morning");
  });
  it("a picked day wins and reads as mono", () => {
    expect(whenCaption({ dayLabel: "Wed 8", lens: "weekend", tod: null })).toEqual({
      text: "Wed 8",
      mono: true,
    });
  });
  it("composes a picked day with a time of day, since the ribbon and the sheet compose", () => {
    expect(whenCaption({ dayLabel: "Sat 10", lens: "all", tod: "evening" }).text).toBe(
      "Sat 10 · Evening",
    );
  });
});

describe("formatDayLabel (picked-day-as-mono)", () => {
  it("reads a YYYY-MM-DD key as 'Wkd D'", () => {
    expect(formatDayLabel("2026-07-04")).toBe("Sat 4"); // US July 4 2026 is a Saturday
    expect(formatDayLabel("2026-07-08")).toBe("Wed 8");
  });
  it("passes a malformed key through untouched", () => {
    expect(formatDayLabel("nope")).toBe("nope");
  });
});

describe("activeWhenPreset ↔ ?lens/?tod mapping", () => {
  it("each preset round-trips through its lens+tod", () => {
    for (const p of WHEN_PRESETS) {
      expect(activeWhenPreset({ lens: p.lens, tod: p.tod })).toBe(p.key);
    }
  });
  it("makes Tonight one token instead of Today plus the Evening daypart", () => {
    expect(WHEN_PRESETS.find((p) => p.key === "tonight")).toMatchObject({ lens: "tonight", tod: null });
    expect(WHEN_PRESETS.find((p) => p.key === "tomorrow")).toMatchObject({ lens: "tomorrow", tod: null });
    expect(activeWhenPreset({ lens: "tonight", tod: null })).toBe("tonight");
    expect(activeWhenPreset({ lens: "today", tod: null })).toBe("today");
  });
  it("a lens narrowed by an extra daypart is no longer a bare preset", () => {
    expect(activeWhenPreset({ lens: "weekend", tod: "morning" })).toBeNull();
    expect(activeWhenPreset({ lens: "all", tod: "late" })).toBeNull();
  });
});

describe("parseTimeParams (shared links keep working)", () => {
  it("opens the old lens=today&tod=evening Tonight link as the one Tonight filter", () => {
    expect(parseTimeParams({ lens: "today", tod: "evening", fallback: "all" })).toEqual({
      time: "tonight",
      tod: null,
    });
  });
  it("reads the new tokens and leaves a standalone daypart alone", () => {
    expect(parseTimeParams({ lens: "tonight", tod: null, fallback: "all" })).toEqual({ time: "tonight", tod: null });
    expect(parseTimeParams({ lens: "tomorrow", tod: null, fallback: "all" })).toEqual({ time: "tomorrow", tod: null });
    expect(parseTimeParams({ lens: null, tod: "evening", fallback: "all" })).toEqual({ time: "all", tod: "evening" });
    expect(parseTimeParams({ lens: "nonsense", tod: null, fallback: "weekend" })).toEqual({ time: "weekend", tod: null });
  });
});

describe("showMoreLabel", () => {
  it("names the window the link expands", () => {
    expect(showMoreLabel({ lens: "weekend" })).toBe("Show more this weekend");
    expect(showMoreLabel({ lens: "tonight" })).toBe("Show more tonight");
    expect(showMoreLabel({ lens: "all", dayLabel: "Wed 8" })).toBe("Show more on Wed 8");
    expect(showMoreLabel({ lens: "all", groupLabel: "Coming up" })).toBe("Show more coming up");
    expect(showMoreLabel({ lens: "all" })).toBe("Show more");
  });
});

describe("countLine", () => {
  it("counts events + the true town count, never a hardcoded number", () => {
    expect(countLine({ events: 128, townName: null, townCount: 9 })).toBe("128 event listings · 9 towns");
    expect(countLine({ events: 1, townName: null, townCount: 1 })).toBe("1 event listing · 1 town");
  });
  it("names the picked town instead of the county tally", () => {
    expect(countLine({ events: 12, townName: "Brunswick", townCount: 9 })).toBe(
      "12 event listings · Brunswick",
    );
  });
  it("labels partial results instead of implying a complete total", () => {
    expect(
      countLine({ events: 27, townName: null, townCount: 3, complete: false }),
    ).toBe("27 event listings shown · 3 towns · partial results");
    expect(
      countLine({ events: 1, townName: "Frederick", townCount: 1, complete: false }),
    ).toBe("1 event listing shown · Frederick · partial results");
  });
});

describe("nextMastheadCollapsed (scroll-collapse threshold)", () => {
  it("is open at the top and folds once past the down threshold", () => {
    expect(nextMastheadCollapsed(0, false)).toBe(false);
    expect(nextMastheadCollapsed(4, false)).toBe(false);
    expect(nextMastheadCollapsed(80, false)).toBe(true);
  });
  it("holds its state inside the dead zone (no flicker mid-list)", () => {
    expect(nextMastheadCollapsed(30, true)).toBe(true);
    expect(nextMastheadCollapsed(30, false)).toBe(false);
  });
  it("springs back only near the very top", () => {
    expect(nextMastheadCollapsed(8, true)).toBe(false);
    expect(nextMastheadCollapsed(9, true)).toBe(true);
  });
});

// Wednesday, October 7, 2026 in Eastern time.
const WED_10AM = "2026-10-07T14:00:00.000Z";
const WED_921PM = "2026-10-08T01:21:00.000Z";
const THU_1AM = "2026-10-08T05:00:00.000Z";
const WEEKEND = ["2026-10-09", "2026-10-10", "2026-10-11"];

describe("weekDayKeys and weekendDayKeys", () => {
  it("lists the ribbon's seven Eastern days, today first", () => {
    expect(weekDayKeys(WED_921PM)).toEqual([
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
    ]);
    expect(weekDayKeys("nope")).toEqual([]);
  });
  it("reads the Friday 5 PM to Monday midnight weekend as Friday, Saturday and Sunday", () => {
    expect(
      weekendDayKeys("2026-10-09T21:00:00.000Z", "2026-10-12T04:00:00.000Z"),
    ).toEqual(WEEKEND);
    expect(weekendDayKeys("2026-10-12T04:00:00.000Z", "2026-10-09T21:00:00.000Z")).toEqual([]);
  });
  it("names the month, or both months when the week crosses one", () => {
    expect(ribbonMonthCaption(weekDayKeys(WED_10AM))).toBe("October");
    expect(ribbonMonthCaption(weekDayKeys("2026-10-28T14:00:00.000Z"))).toBe(
      "October and November",
    );
  });
});

describe("ribbonSelection (?lens and ?d map onto the ribbon)", () => {
  const select = (lens: Parameters<typeof ribbonSelection>[0]["lens"], day: string | null = null, nowISO = WED_10AM) =>
    ribbonSelection({ lens, day, nowISO, weekendDays: WEEKEND });

  it("selects nothing for ?lens=all", () => {
    expect(select("all")).toEqual({ days: [], pressedDay: null, weekend: false });
  });
  it("selects the picked day for ?d=, over any lens", () => {
    expect(select("all", "2026-10-10")).toEqual({
      days: ["2026-10-10"],
      pressedDay: "2026-10-10",
      weekend: false,
    });
    expect(select("weekend", "2026-10-10").weekend).toBe(false);
  });
  it("reads ?lens=today and ?lens=tonight as today's cell", () => {
    expect(select("today").pressedDay).toBe("2026-10-07");
    expect(select("tonight", null, WED_921PM).pressedDay).toBe("2026-10-07");
  });
  it("presses no cell for ?lens=tonight between midnight and 4 AM", () => {
    // At 1 AM Thursday tonight is Wednesday's evening, and Wednesday is not
    // on the ribbon. Pressing Thursday would call the coming day tonight.
    expect(isSmallHours(THU_1AM)).toBe(true);
    expect(isSmallHours(WED_921PM)).toBe(false);
    expect(select("tonight", null, THU_1AM)).toEqual({
      days: [],
      pressedDay: null,
      weekend: false,
    });
    expect(select("today", null, THU_1AM).pressedDay).toBe("2026-10-08");
  });
  it("reads ?lens=tomorrow as the local tomorrow, which at 1 AM is the coming day", () => {
    expect(select("tomorrow").pressedDay).toBe("2026-10-08");
    expect(select("tomorrow", null, THU_1AM).pressedDay).toBe("2026-10-08");
  });
  it("outlines the weekend's days for ?lens=weekend without pressing a single day", () => {
    expect(select("weekend")).toEqual({ days: WEEKEND, pressedDay: null, weekend: true });
  });
  it("leaves the rolling seven-day lens to the answer sentence", () => {
    expect(select("week")).toEqual({ days: [], pressedDay: null, weekend: false });
  });
});

describe("boardAnswer (one sentence under the ribbon)", () => {
  const base = {
    lens: "all" as const,
    day: null,
    nowISO: WED_10AM,
    count: 0,
    countKnown: true,
    narrowed: false,
  };

  it("says tonight is over and where the board goes next", () => {
    expect(isEveningHour(WED_921PM)).toBe(true);
    expect(isEveningHour(WED_10AM)).toBe(false);
    expect(isEveningHour(THU_1AM)).toBe(true);
    expect(boardAnswer({ ...base, nowISO: WED_921PM, firstHorizon: "week" })).toBe(
      "Nothing else is listed for tonight, so here is the rest of the week.",
    );
    expect(boardAnswer({ ...base, nowISO: WED_921PM, firstHorizon: "weekend" })).toBe(
      "Nothing else is listed for tonight, so here is this weekend.",
    );
    expect(
      boardAnswer({ ...base, nowISO: WED_921PM, firstHorizon: "weekend", weekendIsNow: true }),
    ).toBe("Nothing else is listed for tonight, so here is the rest of the weekend.");
    expect(boardAnswer({ ...base, firstHorizon: "later" })).toBe(
      "Nothing else is listed for today, so here is what is coming up.",
    );
  });

  it("leads with today while today still lists something", () => {
    expect(boardAnswer({ ...base, firstHorizon: "today" })).toBe(
      "Today's events are listed first, and later days follow.",
    );
    // In the daytime, tonight's place on the list changes nothing.
    expect(boardAnswer({ ...base, firstHorizon: "today", tonight: "leads" })).toBe(
      "Today's events are listed first, and later days follow.",
    );
    expect(
      boardAnswer({ ...base, nowISO: WED_921PM, firstHorizon: "live", tonight: "leads" }),
    ).toBe("Tonight's events are listed first, and later days follow.");
  });

  it("says tonight leads at 1 AM only when a listed row is one of tonight's", () => {
    // 1:00 AM Thursday: the Today group is Thursday, and nothing of
    // Wednesday night is still listed (the review's Las Áñez case).
    expect(
      boardAnswer({ ...base, nowISO: THU_1AM, firstHorizon: "today", tonight: "none" }),
    ).toBe("Nothing else is listed for tonight, so here is today.");
    expect(boardAnswer({ ...base, nowISO: THU_1AM, firstHorizon: "today" })).toBe(
      "Nothing else is listed for tonight, so here is today.",
    );
    expect(
      boardAnswer({
        ...base,
        nowISO: THU_1AM,
        firstHorizon: "today",
        tonight: "none",
        narrowed: true,
      }),
    ).toBe("Nothing else that matches your filters is listed for tonight, so here is today.");
    // A set still playing from Wednesday night does lead.
    expect(
      boardAnswer({ ...base, nowISO: THU_1AM, firstHorizon: "live", tonight: "leads" }),
    ).toBe("Tonight's events are listed first, and later days follow.");
    // Thursday lists nothing either, so both are spent.
    expect(
      boardAnswer({ ...base, nowISO: THU_1AM, firstHorizon: "week", tonight: "none" }),
    ).toBe("Nothing else is listed for tonight or today, so here is the rest of the week.");
  });

  it("does not call today's all-day rows tonight's events in the evening", () => {
    expect(
      boardAnswer({ ...base, nowISO: WED_921PM, firstHorizon: "today", tonight: "none" }),
    ).toBe("Nothing else is listed for tonight, so here is the rest of today.");
    // A set after midnight sits under a later heading, so neither "tonight
    // leads" nor "nothing tonight" holds; the sentence says only what leads.
    expect(
      boardAnswer({ ...base, nowISO: WED_921PM, firstHorizon: "today", tonight: "later" }),
    ).toBe("Today's events are listed first, and later days follow.");
    expect(
      boardAnswer({ ...base, nowISO: WED_921PM, firstHorizon: "week", tonight: "later" }),
    ).toBeNull();
  });

  it("rolls an empty Tonight forward in one sentence", () => {
    expect(boardAnswer({ ...base, lens: "tonight", nowISO: WED_921PM, rolledForward: true })).toBe(
      "Nothing else is listed for tonight, so here is tomorrow evening.",
    );
    // At 1 AM the next evening falls on the new calendar day, already today.
    expect(boardAnswer({ ...base, lens: "tonight", nowISO: THU_1AM, rolledForward: true })).toBe(
      "Nothing else is listed for tonight, so here is this evening.",
    );
    expect(rollForwardHeading(WED_921PM)).toBe("Tomorrow evening");
    expect(rollForwardHeading(THU_1AM)).toBe("This evening");
  });

  it("names ?lens=tomorrow by its date at 1 AM, when its cell is named today", () => {
    const tomorrow = { ...base, lens: "tomorrow" as const, nowISO: THU_1AM };
    expect(boardAnswer({ ...tomorrow, count: 6 })).toBe(
      "6 events are listed for Thursday, October 8.",
    );
    expect(boardAnswer({ ...tomorrow, count: 6, countKnown: false })).toBe(
      "These are the events on Thursday, October 8.",
    );
    expect(boardAnswer({ ...tomorrow, count: 0 })).toBe(
      "Nothing else is listed for Thursday, October 8.",
    );
    // From 4 AM on, tomorrow is the next cell and keeps its word.
    expect(boardAnswer({ ...base, lens: "tomorrow", count: 3, countKnown: false })).toBe(
      "These are tomorrow's events.",
    );
  });

  it("answers the weekend, with a count only when the board is complete", () => {
    expect(boardAnswer({ ...base, lens: "weekend", count: 23 })).toBe(
      "23 events are listed for this weekend.",
    );
    expect(boardAnswer({ ...base, lens: "weekend", count: 1 })).toBe(
      "1 event is listed for this weekend.",
    );
    expect(boardAnswer({ ...base, lens: "weekend", count: 23, countKnown: false })).toBe(
      "These are this weekend's events.",
    );
    expect(boardAnswer({ ...base, lens: "weekend", count: 4, narrowed: true })).toBe(
      "4 events that match your filters are listed for this weekend.",
    );
    expect(
      boardAnswer({ ...base, lens: "weekend", count: 4, countKnown: false, narrowed: true }),
    ).toBe("These are this weekend's events that match your filters.");
  });

  it("names a picked day in words", () => {
    expect(boardAnswer({ ...base, day: "2026-10-10", count: 14 })).toBe(
      "14 events are listed for Saturday, October 10.",
    );
    expect(boardAnswer({ ...base, day: "2026-10-10", count: 0 })).toBe(
      "Nothing is listed for Saturday, October 10.",
    );
    expect(boardAnswer({ ...base, day: "2026-10-08", count: 3, countKnown: false })).toBe(
      "These are tomorrow's events.",
    );
    expect(boardAnswer({ ...base, day: "2026-10-07", count: 0, narrowed: true })).toBe(
      "Nothing else that matches your filters is listed for today.",
    );
  });

  it("stays quiet when an empty board is still loading or there is no selection to name", () => {
    expect(boardAnswer({ ...base, lens: "tonight", count: 0, countKnown: false })).toBeNull();
    expect(boardAnswer({ ...base })).toBeNull();
    expect(boardAnswer({ ...base, firstHorizon: null })).toBeNull();
  });

  it("never puts a count anywhere but the sentence, and never in a heading word", () => {
    for (const sentence of [
      boardAnswer({ ...base, lens: "tomorrow", count: 9 }),
      boardAnswer({ ...base, lens: "today", count: 2 }),
      boardAnswer({ ...base, lens: "week", count: 30 }),
    ]) {
      expect(sentence).toMatch(/^\d+ events? (?:is|are) listed for [a-z ]+\.$/);
    }
  });

  it("states partial results as a full sentence", () => {
    expect(PARTIAL_SENTENCE).toBe(
      "Some calendars did not load, so this list may be missing events.",
    );
  });
});

describe("tonightPlacement (the default lead comes from the rows, not the clock)", () => {
  type Row = { slug: string; starts_at: string; ends_at: string; is_all_day?: boolean };
  const row = (slug: string, starts_at: string, ends_at: string, is_all_day = false): Row => ({
    slug,
    starts_at,
    ends_at,
    is_all_day,
  });
  /** The grouped default list's lead and the sentence it gets at `nowISO`. */
  const answerFor = (nowISO: string, rows: Row[]) => {
    const now = new Date(nowISO);
    const groups = groupByHorizon(rows, buildHorizonBounds(now));
    const tonight = tonightPlacement(groups, (e) => isTonightEvent(e, +now));
    return {
      firstHorizon: groups[0]?.key ?? null,
      tonight,
      sentence: boardAnswer({
        lens: "all",
        day: null,
        nowISO,
        count: rows.length,
        countKnown: true,
        narrowed: false,
        firstHorizon: groups[0]?.key ?? null,
        tonight,
      }),
    };
  };
  const lasAnez = row("las-anez", "2026-10-08T19:30:00-04:00", "2026-10-08T21:30:00-04:00");

  it("at 1:20 AM Thursday, Thursday's 7:30 PM show is today's, not tonight's", () => {
    expect(answerFor("2026-10-08T05:20:00.000Z", [lasAnez])).toEqual({
      firstHorizon: "today",
      tonight: "none",
      sentence: "Nothing else is listed for tonight, so here is today.",
    });
  });

  it("at 1 AM, a set still playing from last night leads", () => {
    const lateSet = row("late-set", "2026-10-07T22:00:00-04:00", "2026-10-08T02:00:00-04:00");
    expect(answerFor(THU_1AM, [lateSet, lasAnez])).toEqual({
      firstHorizon: "live",
      tonight: "leads",
      sentence: "Tonight's events are listed first, and later days follow.",
    });
  });

  it("at 9:21 PM, a Today group of all-day rows does not make tonight lead", () => {
    const fair = row("fair", "2026-10-07T00:00:00-04:00", "2026-10-08T00:00:00-04:00", true);
    expect(answerFor(WED_921PM, [fair, lasAnez])).toEqual({
      firstHorizon: "today",
      tonight: "none",
      sentence: "Nothing else is listed for tonight, so here is the rest of today.",
    });
  });

  it("at 9:21 PM, a set after midnight is tonight's but listed under a later heading", () => {
    const fair = row("fair", "2026-10-07T00:00:00-04:00", "2026-10-08T00:00:00-04:00", true);
    const afterMidnight = row("dj", "2026-10-08T00:30:00-04:00", "2026-10-08T02:00:00-04:00");
    expect(answerFor(WED_921PM, [fair, afterMidnight])).toEqual({
      firstHorizon: "today",
      tonight: "later",
      sentence: "Today's events are listed first, and later days follow.",
    });
  });

  it("at 9:21 PM, a 10 PM show leads", () => {
    const show = row("show", "2026-10-07T22:00:00-04:00", "2026-10-07T23:30:00-04:00");
    expect(answerFor(WED_921PM, [show, lasAnez]).sentence).toBe(
      "Tonight's events are listed first, and later days follow.",
    );
  });
});
