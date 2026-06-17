import { describe, it, expect } from "vitest";
import { currentMeal, matchMeal, mealForKey, isMealKey, MEALS } from "@/lib/meal";

// All instants below are UTC; June is EDT (UTC-4), so add 4h to get the
// Eastern wall hour. 2026-06-17 is a Wednesday; 2026-06-20 is a Saturday.
const at = (iso: string) => new Date(iso);

describe("currentMeal — the Frederick (Eastern) clock picks the band", () => {
  it("00:00 ET is late night", () => {
    expect(currentMeal(at("2026-06-17T04:00:00Z")).key).toBe("late"); // 00:00 EDT
  });
  it("08:00 ET on a weekday is breakfast", () => {
    expect(currentMeal(at("2026-06-17T12:00:00Z")).key).toBe("breakfast"); // 08:00 EDT Wed
  });
  it("12:30 ET is lunch", () => {
    expect(currentMeal(at("2026-06-17T16:30:00Z")).key).toBe("lunch"); // 12:30 EDT
  });
  it("19:00 ET is dinner", () => {
    expect(currentMeal(at("2026-06-17T23:00:00Z")).key).toBe("dinner"); // 19:00 EDT
  });
  it("23:00 ET is late night", () => {
    expect(currentMeal(at("2026-06-18T03:00:00Z")).key).toBe("late"); // 23:00 EDT Wed
  });
  it("10:00 ET on a weekend is brunch (overrides breakfast)", () => {
    expect(currentMeal(at("2026-06-20T14:00:00Z")).key).toBe("brunch"); // 10:00 EDT Sat
  });
});

describe("matchMeal — honest category gate, never a service claim", () => {
  const place = (category: string, name = "Somewhere") => ({ category, name });

  it("dinner includes restaurants + pizza-by-name, excludes bars and breweries", () => {
    expect(matchMeal(MEALS.dinner, place("restaurant"))).toBe(true);
    expect(matchMeal(MEALS.dinner, place("restaurant", "Tony's Pizzeria"))).toBe(true);
    expect(matchMeal(MEALS.dinner, place("bar"))).toBe(false); // Drinks answers this
    expect(matchMeal(MEALS.dinner, place("brewery"))).toBe(false);
  });

  it("breakfast folds in coffee shops and bakeries", () => {
    expect(matchMeal(MEALS.breakfast, place("coffee"))).toBe(true);
    expect(matchMeal(MEALS.breakfast, place("bakery"))).toBe(true);
    expect(matchMeal(MEALS.breakfast, place("bar"))).toBe(false);
  });

  it("late night keeps a bar (a late-bite answer at 11pm)", () => {
    expect(matchMeal(MEALS.late, place("bar"))).toBe(true);
  });
});

describe("meal key helpers", () => {
  it("recognizes meal keys and rejects noun cravings", () => {
    expect(isMealKey("dinner")).toBe(true);
    expect(isMealKey("coffee")).toBe(false);
    expect(isMealKey(null)).toBe(false);
    expect(mealForKey("dinner")?.label).toBe("Dinner");
    expect(mealForKey("coffee")).toBeNull();
  });
});
