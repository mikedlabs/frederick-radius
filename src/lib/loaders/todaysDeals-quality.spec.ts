import { describe, expect, it } from "vitest";
import { isActionableDeal } from "./todaysDeals";

describe("isActionableDeal", () => {
  it.each([
    "Tuesday: $5 burgers and $2.50 drafts",
    "Wednesday: 50% off all pasta entrees",
    "We Heart Wednesdays: $3 select beers, $5 margaritas, and $3 beef tacos",
    "Pizza Night: $10 red or white pizzas",
    "Taco specials every Tuesday",
    "Happy hour includes half-price appetizers",
    "Fill the rewards card and your next ice cream is free",
  ])("keeps a concrete customer offer: %s", (text) => {
    expect(isActionableDeal(text)).toBe(true);
  });

  it.each([
    "Guided vineyard tour and tasting is $20 per person",
    "Signature cocktails are listed at $14-$16",
    "Live music every Saturday from 2-5 PM",
    "Trivia winner gets free beer and a prize",
    "Trivia Night every Thursday. Winner gets free beer and a special prize",
    "Lawn games are free to use",
    "Wine club members receive a complimentary tasting",
    "Brunch served Saturday and Sunday",
    "Gift cards and catering are available",
  ])("rejects directory, event, or restricted content: %s", (text) => {
    expect(isActionableDeal(text)).toBe(false);
  });
});
