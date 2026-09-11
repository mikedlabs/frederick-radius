import { describe, it, expect } from "vitest";
import { inQuietHours, shouldDeliver } from "./push-delivery";

describe("inQuietHours", () => {
  it("returns false when either bound is null (no quiet hours)", () => {
    expect(inQuietHours(null, 8, 3)).toBe(false);
    expect(inQuietHours(21, null, 3)).toBe(false);
    expect(inQuietHours(null, null, 3)).toBe(false);
  });

  it("returns false for an empty window (start === end)", () => {
    expect(inQuietHours(9, 9, 9)).toBe(false);
  });

  it("handles a same-day window [start, end)", () => {
    // Quiet 13..17
    expect(inQuietHours(13, 17, 12)).toBe(false); // before
    expect(inQuietHours(13, 17, 13)).toBe(true); // inclusive start
    expect(inQuietHours(13, 17, 16)).toBe(true);
    expect(inQuietHours(13, 17, 17)).toBe(false); // exclusive end
  });

  it("handles a window that wraps midnight (21..7)", () => {
    expect(inQuietHours(21, 7, 22)).toBe(true); // late night
    expect(inQuietHours(21, 7, 0)).toBe(true); // midnight
    expect(inQuietHours(21, 7, 6)).toBe(true); // early morning
    expect(inQuietHours(21, 7, 7)).toBe(false); // exclusive end
    expect(inQuietHours(21, 7, 12)).toBe(false); // midday
    expect(inQuietHours(21, 7, 20)).toBe(false); // just before
    expect(inQuietHours(21, 7, 21)).toBe(true); // inclusive start
  });
});

describe("shouldDeliver", () => {
  // 2 AM Eastern (EDT, July) — deep in a typical 21..7 quiet window.
  const twoAmEt = new Date("2026-07-13T02:00:00-04:00");
  // 2 PM Eastern — outside it.
  const twoPmEt = new Date("2026-07-13T14:00:00-04:00");

  it("always delivers urgent pushes, even inside quiet hours", () => {
    expect(shouldDeliver({ quiet_start: 21, quiet_end: 7 }, { urgent: true }, twoAmEt)).toBe(true);
  });

  it("holds a non-urgent push inside quiet hours", () => {
    expect(shouldDeliver({ quiet_start: 21, quiet_end: 7 }, { urgent: false }, twoAmEt)).toBe(false);
  });

  it("delivers a non-urgent push outside quiet hours", () => {
    expect(shouldDeliver({ quiet_start: 21, quiet_end: 7 }, {}, twoPmEt)).toBe(true);
  });

  it("delivers when no quiet hours are set", () => {
    expect(shouldDeliver({}, {}, twoAmEt)).toBe(true);
  });
});
