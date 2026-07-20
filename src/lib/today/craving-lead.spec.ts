import { describe, it, expect } from "vitest";
import { defaultWant, suppressedDaypartCategories } from "./craving-lead";

// Fixed Eastern moments. Eastern is UTC-4 in summer, so add 4h to the wall
// clock to get the UTC instant.
const at = (weekdayIso: string) => new Date(weekdayIso);
// 2026-07-20 is a Monday; 2026-07-24 a Friday; 2026-07-25 a Saturday.
const MON_9AM = at("2026-07-20T13:00:00Z"); // 09:00 ET Monday
const MON_1PM = at("2026-07-20T17:00:00Z"); // 13:00 ET Monday
const MON_6PM = at("2026-07-20T22:00:00Z"); // 18:00 ET Monday
const MON_11PM = at("2026-07-21T03:00:00Z"); // 23:00 ET Monday
const SAT_1PM = at("2026-07-25T17:00:00Z"); // 13:00 ET Saturday
const FRI_6PM = at("2026-07-24T22:00:00Z"); // 18:00 ET Friday

describe("defaultWant", () => {
  it("opens to Eat on an ordinary weekday daytime", () => {
    expect(defaultWant(MON_9AM)).toBe("eat");
    expect(defaultWant(MON_1PM)).toBe("eat");
    expect(defaultWant(MON_6PM)).toBe("eat");
  });
  it("opens to Drink late at night and on Fri/Sat evenings", () => {
    expect(defaultWant(MON_11PM)).toBe("drink");
    expect(defaultWant(FRI_6PM)).toBe("drink");
  });
  it("opens to Outdoors on a weekend afternoon", () => {
    expect(defaultWant(SAT_1PM)).toBe("outdoors");
  });
});

describe("suppressedDaypartCategories", () => {
  it("drops the duplicate restaurant rail while Eat is the visible lead", () => {
    expect([...suppressedDaypartCategories(MON_6PM)]).toEqual(["restaurant"]);
    expect([...suppressedDaypartCategories(MON_1PM)]).toEqual(["restaurant"]);
  });
  it("drops the duplicate brewery/bar rails while Drink is the visible lead", () => {
    const drink = suppressedDaypartCategories(FRI_6PM);
    expect(drink.has("brewery")).toBe(true);
    expect(drink.has("bar")).toBe(true);
    expect(drink.has("restaurant")).toBe(false);
  });
  it("suppresses nothing when the visible lead is neither eat nor drink", () => {
    expect(suppressedDaypartCategories(SAT_1PM).size).toBe(0);
  });
});
