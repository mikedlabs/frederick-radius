import { describe, expect, it } from "vitest";
import {
  countLine,
  defaultTimeMode,
  dockDirty,
  formatHourLabel,
  layersCaption,
  whatCaption,
  whenCaption,
} from "./dockCaption";

describe("defaultTimeMode (the time-aware default window)", () => {
  it("prefers the nearest window that has events", () => {
    expect(defaultTimeMode({ now: 3, tonight: 6, weekend: 9, all: 14 })).toBe("now");
    expect(defaultTimeMode({ now: 0, tonight: 6, weekend: 9, all: 14 })).toBe("tonight");
    expect(defaultTimeMode({ now: 0, tonight: 0, weekend: 9, all: 14 })).toBe("weekend");
  });
  it("falls back to the week when nothing nearer has events", () => {
    expect(defaultTimeMode({ now: 0, tonight: 0, weekend: 0, all: 2 })).toBe("all");
    expect(defaultTimeMode({})).toBe("all");
  });
});

describe("formatHourLabel", () => {
  it("reads like a clock", () => {
    expect(formatHourLabel(18.5)).toBe("6:30 PM");
    expect(formatHourLabel(6)).toBe("6:00 AM");
    expect(formatHourLabel(12)).toBe("12:00 PM");
    expect(formatHourLabel(24)).toBe("12:00 AM");
    expect(formatHourLabel(9.25)).toBe("9:15 AM");
  });
});

describe("whatCaption", () => {
  it("rests on Everything", () => {
    expect(whatCaption({ layerCount: 0 })).toEqual({ main: "Everything", plus: undefined });
  });
  it("names the intent, and the sub when one is chosen", () => {
    expect(whatCaption({ intentLabel: "Eat & drink", layerCount: 0 }).main).toBe("Eat & drink");
    expect(
      whatCaption({ intentLabel: "Eat & drink", subLabel: "Pizza", layerCount: 0 }).main,
    ).toBe("Pizza");
  });
  it("leads with an active lens", () => {
    expect(
      whatCaption({ lensLabels: ["Saved"], intentLabel: "Coffee", layerCount: 0 }).main,
    ).toBe("Saved · Coffee");
  });
  it("names one layer, counts several", () => {
    expect(
      whatCaption({ layerCount: 1, singleLayerLabel: "Trails" }).plus,
    ).toBe("+ Trails");
    expect(whatCaption({ layerCount: 3 }).plus).toBe("+ 3 layers");
  });
});

describe("layersCaption (the fourth caption word)", () => {
  it("names the always-visible base map when no overlays are on", () => {
    expect(layersCaption([])).toEqual({ main: "Base map", active: false });
  });
  it("names a single layer", () => {
    expect(layersCaption(["Trails"])).toEqual({ main: "Trails", active: true });
  });
  it("names the first and tallies the rest", () => {
    expect(layersCaption(["Trails", "Transit"])).toEqual({
      main: "Trails",
      plus: "+1",
      active: true,
    });
    expect(layersCaption(["Trails", "Transit", "Aerial photos", "Saved"]).plus).toBe("+3");
  });
});

describe("whenCaption", () => {
  it("rests on All day", () => {
    expect(whenCaption({ scrubHour: null, openNow: false, timeMode: "all" })).toEqual({
      text: "All day",
      mono: false,
      tone: "quiet",
    });
  });
  it("reads the time-aware window (evening default → Tonight)", () => {
    expect(whenCaption({ scrubHour: null, openNow: false, timeMode: "tonight" })).toEqual({
      text: "Tonight",
      mono: false,
      tone: "window",
    });
  });
  it("leads with Open now and keeps the window", () => {
    expect(whenCaption({ scrubHour: null, openNow: true, timeMode: "weekend" })).toEqual({
      text: "Open now · This weekend",
      mono: false,
      tone: "open",
    });
    expect(whenCaption({ scrubHour: null, openNow: true, timeMode: "all" }).text).toBe(
      "Open now",
    );
  });
  it("a scrubbed hour wins, in mono", () => {
    expect(whenCaption({ scrubHour: 18.5, openNow: true, timeMode: "tonight" })).toEqual({
      text: "6:30 PM",
      mono: true,
      tone: "scrub",
    });
  });
});

describe("countLine (the living caption)", () => {
  it("counts what's drawn, with no filler words", () => {
    expect(countLine({ places: 16, events: 14, closingSoon: 0, scrubHour: null })).toBe(
      "16 places · 14 events",
    );
  });
  it("formats big counts and singulars", () => {
    expect(countLine({ places: 1712, events: 1, closingSoon: 0, scrubHour: null })).toBe(
      "1,712 places · 1 event",
    );
  });
  it("stays silent about zero events (the pixels belong to the live facts)", () => {
    expect(countLine({ places: 1, events: 0, closingSoon: 0, scrubHour: null })).toBe("1 place");
    expect(countLine({ places: 1594, events: 0, closingSoon: 190, scrubHour: null })).toBe(
      "1,594 places · 190 close within the hour",
    );
  });
  it("adds the closing-soon clause when it's true right now", () => {
    expect(countLine({ places: 16, events: 14, closingSoon: 3, scrubHour: null })).toBe(
      "16 places · 14 events · 3 close within the hour",
    );
    expect(countLine({ places: 16, events: 14, closingSoon: 1, scrubHour: null })).toBe(
      "16 places · 14 events · 1 closes within the hour",
    );
  });
  it("carries the scrubbed time (even at zero events) and drops the live closing clause", () => {
    expect(countLine({ places: 16, events: 5, closingSoon: 3, scrubHour: 18.5 })).toBe(
      "16 places · 5 events at 6:30 PM",
    );
    expect(countLine({ places: 16, events: 0, closingSoon: 3, scrubHour: 18.5 })).toBe(
      "16 places · 0 events at 6:30 PM",
    );
  });
});

describe("dockDirty", () => {
  const clean = {
    intentActive: false,
    openNow: false,
    timeModeExplicit: false,
    scrubActive: false,
    lensActive: false,
    layerCount: 0,
    whereAway: false,
  };
  it("rests clean", () => {
    expect(dockDirty(clean)).toBe(false);
  });
  it("the time-aware default window is not dirt", () => {
    // timeMode may read "Tonight" by default; only an explicit ?t= counts.
    expect(dockDirty({ ...clean, timeModeExplicit: false })).toBe(false);
    expect(dockDirty({ ...clean, timeModeExplicit: true })).toBe(true);
  });
  it("any real filter shows the ×", () => {
    expect(dockDirty({ ...clean, intentActive: true })).toBe(true);
    expect(dockDirty({ ...clean, openNow: true })).toBe(true);
    expect(dockDirty({ ...clean, scrubActive: true })).toBe(true);
    expect(dockDirty({ ...clean, lensActive: true })).toBe(true);
    expect(dockDirty({ ...clean, layerCount: 2 })).toBe(true);
    expect(dockDirty({ ...clean, whereAway: true })).toBe(true);
  });
});
