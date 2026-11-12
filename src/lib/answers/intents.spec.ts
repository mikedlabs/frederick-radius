import { describe, it, expect } from "vitest";
import { QUICK_INTENTS, findQuickAnswers } from "@/lib/answers/intents";

describe("findQuickAnswers (extracted SearchOverlay logic, single source)", () => {
  it("matches a known phrase to its intent", () => {
    expect(findQuickAnswers("anything open right now?")[0]?.status).toBe("open-now");
    expect(findQuickAnswers("where to park downtown")[0]?.key).toBe("parking");
    expect(findQuickAnswers("next marc train")[0]?.key).toBe("transit");
    expect(findQuickAnswers("nearest blue mailbox")[0]?.href).toBe("/shipping");
    expect(findQuickAnswers("where is a water fountain")[0]?.href).toBe("/amenities?need=water");
    expect(findQuickAnswers("where is the closest trash can")[0]?.href).toBe("/amenities?need=trash");
    expect(findQuickAnswers("I need a dog bag")[0]?.href).toBe("/amenities?need=dog-bags");
    expect(findQuickAnswers("where can I charge my phone")[0]?.href).toBe("/amenities?need=power");
    expect(findQuickAnswers("brunch this weekend")[0]?.href).toBe("/brunch");
    expect(findQuickAnswers("food trucks today")[0]?.href).toBe("/food-trucks");
  });

  it("ignores queries shorter than 3 chars", () => {
    expect(findQuickAnswers("a")).toEqual([]);
    expect(findQuickAnswers("")).toEqual([]);
  });

  it("leads a craving query with the nearest-open craving answer", () => {
    const top = findQuickAnswers("coffee open now near me")[0];
    expect(top?.key).toBe("craving:coffee");
    expect(top?.href).toBe("/nearby?c=coffee");
    // "beer" resolves to breweries, not the broad drinks bucket.
    expect(findQuickAnswers("where's a good beer")[0]?.href).toBe("/nearby?c=breweries");
  });

  it("still answers a bare open-now query with the open-now intent", () => {
    expect(findQuickAnswers("anything open right now?")[0]?.status).toBe("open-now");
    expect(findQuickAnswers("what's open")[0]?.key).toBe("open-now");
  });

  it.each([
    ["Bushwaller’s Irish Pub", "transit"],
    ["In Fit Personal Training Studio", "transit"],
    ["Mount Olivet Cemetery", "parking"],
    ["Giant Eagle - West Seventh Street", "events"],
  ])("does not turn a word inside %s into %s", (query, falseIntent) => {
    expect(findQuickAnswers(query).map((answer) => answer.key)).not.toContain(falseIntent);
  });

  it.each([
    ["bus", "transit"],
    ["buses", "transit"],
    ["next trains", "transit"],
    ["MARC departures", "transit"],
    ["transit routes", "transit"],
    ["commutes", "transit"],
    ["parking", "parking"],
    ["parking garages", "parking"],
    ["nearest meters", "parking"],
    ["restrooms", "restrooms"],
    ["bathrooms", "restrooms"],
    ["public toilets", "restrooms"],
    ["water fountains", "drinking-water"],
    ["bottle refills", "drinking-water"],
    ["bottle filling stations", "drinking-water"],
    ["trash cans", "trash"],
    ["waste baskets", "trash"],
    ["garbage cans", "trash"],
    ["dog bags", "dog-bags"],
    ["poop bags", "dog-bags"],
    ["public benches", "seating"],
    ["nearest benches", "seating"],
    ["power outlets", "power"],
    ["phone chargers", "power"],
    ["laptop chargers", "power"],
    ["post offices", "shipping"],
    ["blue mailboxes", "shipping"],
    ["collection boxes", "shipping"],
    ["UPS stores", "shipping"],
    ["events", "events"],
    ["calendars", "events"],
    ["happenings", "events"],
  ])("retains the complete utility words in %s", (query, key) => {
    expect(findQuickAnswers(query).map((answer) => answer.key)).toContain(key);
  });

  it.each([
    ["concerts", "tonight"],
    ["weekends", "weekend"],
    ["saturdays", "weekend"],
    ["sundays", "weekend"],
    ["movies", "craving:movies"],
    ["brunches", "brunch"],
    ["food trucks", "food-trucks"],
  ])("preserves plural discovery requests for %s", (query, key) => {
    expect(findQuickAnswers(query).map((answer) => answer.key)).toContain(key);
  });

  it.each([
    ["Where can I park the car?", "parking"],
    ["A public   toilet, please", "restrooms"],
    ["Where is drinking\nwater?", "drinking-water"],
    ["Can I charge my phone?", "power"],
    ["Where’s a blue mailbox?", "shipping"],
    ["What’s open right now?", "open-now"],
  ])("matches phrase boundaries and ordinary punctuation in %s", (query, key) => {
    expect(findQuickAnswers(query).map((answer) => answer.key)).toContain(key);
  });

  it.each(["bushel", "marco", "weekender", "garageband", "eventual", "ébus", "busé"])(
    "does not interpret the partial word %s as a quick need",
    (query) => {
      expect(findQuickAnswers(query)).toEqual([]);
    },
  );

  it("every intent carries the fields the overlay + AnswerCards need", () => {
    for (const i of QUICK_INTENTS) {
      expect(i.href).toBeTruthy();
      expect(i.chip).toBeTruthy();
      expect(["clock", "calendar", "train", "pin"]).toContain(i.icon);
    }
  });
});

// buildTodayAnswers + its tests were removed on 2026-06-17: the /today
// "answers lead" section it fed only ever rendered the "On tonight" card,
// which duplicated the SkyHero's tonight teaser, so the card, the section,
// and the loader were all retired together.
