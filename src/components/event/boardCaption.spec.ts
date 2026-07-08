import { describe, expect, it } from "vitest";
import {
  activeWhenPreset,
  countLine,
  formatDayLabel,
  nextMastheadCollapsed,
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
  it("composes Tonight from today + evening", () => {
    expect(whenCaption({ dayLabel: null, lens: "today", tod: "evening" }).text).toBe("Tonight");
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
  it("Tonight wins over Today when the evening daypart is on", () => {
    expect(activeWhenPreset({ lens: "today", tod: "evening" })).toBe("tonight");
    expect(activeWhenPreset({ lens: "today", tod: null })).toBe("today");
  });
  it("a lens narrowed by an extra daypart is no longer a bare preset", () => {
    expect(activeWhenPreset({ lens: "weekend", tod: "morning" })).toBeNull();
    expect(activeWhenPreset({ lens: "all", tod: "late" })).toBeNull();
  });
});

describe("countLine", () => {
  it("counts events + the true town count, never a hardcoded number", () => {
    expect(countLine({ events: 128, townName: null, townCount: 9 })).toBe("128 events · 9 towns");
    expect(countLine({ events: 1, townName: null, townCount: 1 })).toBe("1 event · 1 town");
  });
  it("names the picked town instead of the county tally", () => {
    expect(countLine({ events: 12, townName: "Brunswick", townCount: 9 })).toBe(
      "12 events · Brunswick",
    );
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
