import { describe, expect, it } from "vitest";
import {
  isLikelyOpenNow,
  openingSoonFromStatus,
  reliableOpeningSoon,
} from "./reliable-open-windows";

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

  it("recognizes Gravel & Grind only inside the bounded hour before opening", () => {
    const gravelAndGrind = "gravel-and-grind-frederick";

    expect(
      reliableOpeningSoon(
        gravelAndGrind,
        new Date("2026-09-02T10:59:00.000Z"),
      ),
    ).toBeNull();
    expect(
      reliableOpeningSoon(
        gravelAndGrind,
        new Date("2026-09-02T11:00:00.000Z"),
      ),
    ).toEqual({ opensAt: "08:00", minutesUntil: 60 });
    expect(
      reliableOpeningSoon(
        gravelAndGrind,
        new Date("2026-09-02T11:59:00.000Z"),
      ),
    ).toEqual({ opensAt: "08:00", minutesUntil: 1 });
    expect(
      reliableOpeningSoon(
        gravelAndGrind,
        new Date("2026-09-02T12:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      isLikelyOpenNow(
        gravelAndGrind,
        new Date("2026-09-02T12:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("requires an explicit same-day verified opening for the confirmed path", () => {
    const now = new Date("2026-09-02T11:13:00.000Z");

    expect(
      openingSoonFromStatus(
        {
          state: "closed",
          opensAt: "08:00",
          opensDay: "wed",
          opensToday: true,
        },
        now,
      ),
    ).toEqual({ opensAt: "08:00", minutesUntil: 47 });
    expect(
      openingSoonFromStatus(
        {
          state: "closed",
          opensAt: "08:00",
          opensDay: "thu",
          opensToday: false,
        },
        now,
      ),
    ).toBeNull();
    expect(openingSoonFromStatus({ state: "unverified" }, now)).toBeNull();
  });
});
