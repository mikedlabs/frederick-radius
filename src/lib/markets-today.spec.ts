import { describe, it, expect } from "vitest";
import { marketsOpenOn } from "./markets-today";
import type { MdMarket } from "@/lib/integrations/mdFarmersMarkets";

const mk = (name: string, day?: string, hours?: string): MdMarket => ({
  name,
  norm: name.toUpperCase().replace(/[^A-Z0-9]+/g, ""),
  day,
  hours,
});

const MARKETS = [
  mk("Frederick City Market", "Sunday", "9am - 1pm"),
  mk("Thurmont Main Street Farmers Market", "Saturday", "9am - noon"),
  mk("Urbana Farmers Market", "Sunday", "12pm - 3pm"),
  mk("No Hours Market", "Saturday", undefined), // missing hours → excluded
  mk("No Day Market", undefined, "9am - 1pm"), // missing day → excluded
];

// 2026-07-05 is a Sunday; 2026-07-04 a Saturday (UTC noon avoids TZ edge).
const SUNDAY = new Date("2026-07-05T16:00:00.000Z");
const SATURDAY = new Date("2026-07-04T16:00:00.000Z");
const MONDAY = new Date("2026-07-06T16:00:00.000Z");

describe("marketsOpenOn", () => {
  it("returns the markets whose recurring day is today (Eastern)", () => {
    expect(marketsOpenOn(MARKETS, SUNDAY).map((m) => m.name)).toEqual([
      "Frederick City Market",
      "Urbana Farmers Market",
    ]);
  });

  it("matches a different weekday correctly", () => {
    const sat = marketsOpenOn(MARKETS, SATURDAY).map((m) => m.name);
    expect(sat).toEqual(["Thurmont Main Street Farmers Market"]); // No Hours Market excluded
  });

  it("returns nothing on a day with no markets", () => {
    expect(marketsOpenOn(MARKETS, MONDAY)).toEqual([]);
  });

  it("excludes markets missing a day or hours (never a partial claim)", () => {
    const names = marketsOpenOn(MARKETS, SATURDAY).map((m) => m.name);
    expect(names).not.toContain("No Hours Market");
    expect(names).not.toContain("No Day Market");
  });
});
