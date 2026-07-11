import { describe, expect, it } from "vitest";
import { LENS_WORDS } from "./timeLens";
import { TIME_WINDOWS } from "@/components/map/dockCaption";
import { LENS_LABEL, WHEN_PRESETS } from "@/components/event/boardCaption";

/**
 * UX-03: the map dock and the events board must speak the same time
 * words. These pins fail the moment either surface hardcodes a label
 * again instead of reading the shared dictionary.
 */
describe("timeLens parity", () => {
  it("the words the surfaces share are literally the same string", () => {
    const mapLabel = Object.fromEntries(TIME_WINDOWS.map((w) => [w.key, w.label]));
    // Tonight and This weekend are the two windows BOTH surfaces offer.
    expect(mapLabel.tonight).toBe(LENS_WORDS.tonight);
    expect(mapLabel.weekend).toBe(LENS_WORDS.weekend);
    expect(LENS_LABEL.weekend).toBe(LENS_WORDS.weekend);
    expect(WHEN_PRESETS.find((p) => p.key === "tonight")?.label).toBe(LENS_WORDS.tonight);
    expect(WHEN_PRESETS.find((p) => p.key === "weekend")?.label).toBe(LENS_WORDS.weekend);
  });

  it("distinct windows keep distinct honest words (no false merging)", () => {
    // The map's ?t=all is a 7-day horizon ("This week"); the events
    // lens=week is this week MINUS today/weekend ("Later this week");
    // events all is no narrowing at all ("Anytime"). Three windows,
    // three words — collapsing them would lie about a window's size.
    const mapAll = TIME_WINDOWS.find((w) => w.key === "all")?.label;
    expect(mapAll).toBe(LENS_WORDS.week);
    expect(LENS_LABEL.week).toBe(LENS_WORDS.laterWeek);
    expect(new Set([LENS_WORDS.week, LENS_WORDS.laterWeek, LENS_WORDS.anytime]).size).toBe(3);
  });
});
