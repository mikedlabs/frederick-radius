import { describe, expect, it } from "vitest";
import { isLikelyOpenNow } from "./reliable-open-windows";

const dublin = "dublin-roasters-frederick";

describe("isLikelyOpenNow", () => {
  it("evaluates curated windows in Frederick local time", () => {
    expect(isLikelyOpenNow(dublin, new Date("2026-07-26T10:59:00.000Z"))).toBe(
      false,
    );
    expect(isLikelyOpenNow(dublin, new Date("2026-07-26T11:00:00.000Z"))).toBe(
      true,
    );
  });

  it("treats the posted closing time as closed", () => {
    expect(isLikelyOpenNow(dublin, new Date("2026-07-26T21:59:00.000Z"))).toBe(
      true,
    );
    expect(isLikelyOpenNow(dublin, new Date("2026-07-26T22:00:00.000Z"))).toBe(
      false,
    );
  });

  it("uses Gravel & Grind's day-specific official schedule conservatively", () => {
    const gravelAndGrind = "gravel-and-grind-frederick";
    expect(
      isLikelyOpenNow(
        gravelAndGrind,
        new Date("2026-07-26T16:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isLikelyOpenNow(
        gravelAndGrind,
        new Date("2026-07-26T19:45:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isLikelyOpenNow(
        gravelAndGrind,
        new Date("2026-07-28T17:45:00.000Z"),
      ),
    ).toBe(false);
  });

  it("does not carry Surelocked In's old temporary closure past its reopening", () => {
    const surelocked = "surelocked-in-escape-games-frederick";
    expect(
      isLikelyOpenNow(surelocked, new Date("2026-07-26T16:59:00.000Z")),
    ).toBe(false);
    expect(
      isLikelyOpenNow(surelocked, new Date("2026-07-26T17:00:00.000Z")),
    ).toBe(true);
    expect(
      isLikelyOpenNow(surelocked, new Date("2026-07-27T18:00:00.000Z")),
    ).toBe(false);
  });
});
